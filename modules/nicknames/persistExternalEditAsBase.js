function reverseWrap(wrap, s) {
    if (typeof wrap.value !== 'function') return null;
    const sentinel = 'NICK_BASE';
    const wrapped = wrap.value(sentinel);
    if (typeof wrapped !== 'string') return null;
    const idx = wrapped.indexOf(sentinel);
    if (idx === -1) return null;
    const before = wrapped.slice(0, idx);
    const after = wrapped.slice(idx + sentinel.length);
    if (!s.startsWith(before) || !s.endsWith(after)) return null;
    if (s.length < before.length + after.length) return null;
    return s.slice(before.length, s.length - after.length);
}

module.exports.persistExternalEditAsBase = async function (client, member) {
    const moduleModel = client.models['nicknames']['User'];
    const roles = client.configurations?.['nicknames']?.['strings'] || [];
    const config = client.configurations?.['nicknames']?.['config'] || {};

    let residue = member.nickname ?? member.user.displayName;

    if (client.nicknameManager) {
        try {
            await client.nicknameManager.pollProviders(member);
        } catch (e) {
            client.logger?.warn?.(`[nicknames] pollProviders failed for ${member.id}: ${e.message}`);
        }
    }

    const contributions = client.nicknameManager
        ? client.nicknameManager.getContributions(member.id)
        : [];

    const wraps = contributions
        .filter(c => c.position === 'wrap')
        .sort((a, b) => a.priority - b.priority);
    for (const wrap of wraps) {
        try {
            const next = reverseWrap(wrap, residue);
            if (next !== null) residue = next;
        } catch (e) {
            client.logger?.warn?.(`[nicknames] could not reverse wrap ${wrap.source} for ${member.id}: ${e.message}`);
        }
    }

    const prefixContribs = contributions.filter(c => c.position === 'prefix');
    const suffixContribs = contributions.filter(c => c.position === 'suffix');
    let previous;
    do {
        previous = residue;
        for (const c of prefixContribs) {
            if (c.match instanceof RegExp) {
                const re = new RegExp('^(?:' + c.match.source + ')', c.match.flags.replace('g', ''));
                const m = residue.match(re);
                if (m && m[0].length > 0) residue = residue.slice(m[0].length);
            } else if (typeof c.value === 'string' && c.value && residue.startsWith(c.value)) {
                residue = residue.slice(c.value.length);
            }
        }
        for (const c of suffixContribs) {
            if (c.match instanceof RegExp) {
                const re = new RegExp('(?:' + c.match.source + ')$', c.match.flags.replace('g', ''));
                const m = residue.match(re);
                if (m && m[0].length > 0) residue = residue.slice(0, residue.length - m[0].length);
            } else if (typeof c.value === 'string' && c.value && residue.endsWith(c.value)) {
                residue = residue.slice(0, -c.value.length);
            }
        }
        for (const role of roles) {
            if (role.prefix && residue.startsWith(role.prefix)) {
                residue = residue.slice(role.prefix.length);
            }
            if (role.suffix && residue.endsWith(role.suffix)) {
                residue = residue.slice(0, -role.suffix.length);
            }
        }
    } while (residue !== previous);

    if (!residue) residue = member.user.displayName;
    if (config.forceDisplayname) residue = member.user.displayName;

    const existing = await moduleModel.findOne({where: {userID: member.id}});
    if (existing) {
        if (existing.nickname !== residue) {
            existing.nickname = residue;
            await existing.save();
        }
    } else {
        await moduleModel.create({
            userID: member.id,
            nickname: residue
        });
    }
};
