const {persistExternalEditAsBase} = require('./persistExternalEditAsBase');

module.exports.onLoad = function (client) {
    if (client.nicknamesProviderRegistered) return;
    client.nicknamesProviderRegistered = true;

    client.nicknameManager.registerProvider('nicknames', 'nicknames', async (member) => {
        const config = client.configurations?.['nicknames']?.['config'];
        const roles = client.configurations?.['nicknames']?.['strings'];
        if (!config || !roles) return null;

        const stored = await client.models['nicknames']['User'].findOne({where: {userID: member.id}});
        const baseName = config.forceDisplayname
            ? member.user.displayName
            : (stored?.nickname ?? member.user.displayName);

        const sortedRoles = [...member.roles.cache.values()].sort((a, b) => b.position - a.position);
        let matched = null;
        for (const r of sortedRoles) {
            const m = roles.find(x => x.roleID === r.id);
            if (m) {
                matched = m;
                break;
            }
        }

        const out = [{
            source: 'nicknames:base',
            position: 'base',
            value: baseName,
            priority: 100
        }];
        if (matched?.prefix) out.push({
            source: 'nicknames:rolePrefix',
            position: 'prefix',
            value: matched.prefix,
            priority: 10
        });
        if (matched?.suffix) out.push({
            source: 'nicknames:roleSuffix',
            position: 'suffix',
            value: matched.suffix,
            priority: 10
        });
        return out;
    });

    client.nicknameManager.setBootstrapMemberHook(async (member) => {

        if (client.modules?.['nicknames']?.enabled === false) return;
        await persistExternalEditAsBase(client, member);
    });
};
