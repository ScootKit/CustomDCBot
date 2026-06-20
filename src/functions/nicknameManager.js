class NicknameManager {
    constructor(client) {
        this.client = client;

        this.providers = new Map();

        this.globalTransforms = new Map();

        this.members = new Map();
    }

    stateFor(memberId) {
        let s = this.members.get(memberId);
        if (!s) {
            s = {
                contributions: new Map(),
                lastRendered: null,
                lastDecorations: null,
                applyQueued: false,
                pending: null
            };
            this.members.set(memberId, s);
        }
        return s;
    }

    set(memberId, source, contribution) {
        const c = {
            ...contribution,
            source
        };
        if (typeof c.priority !== 'number') c.priority = 0;
        if (typeof c.exclusive !== 'boolean') c.exclusive = false;
        const state = this.stateFor(memberId);
        state.contributions.set(source, c);
        state.applyQueued = true;
        if (this.memberRefs?.has(memberId)) this.scheduleFlush(memberId);
    }

    clear(memberId, source) {
        const state = this.members.get(memberId);
        if (!state) return;
        state.contributions.delete(source);
        state.applyQueued = true;
        if (this.memberRefs?.has(memberId)) this.scheduleFlush(memberId);
    }

    registerGlobalTransform(source, moduleName, opts) {
        this.globalTransforms.set(source, {
            moduleName,
            position: opts.position,
            value: opts.value,
            priority: typeof opts.priority === 'number' ? opts.priority : 0
        });
    }

    unregisterGlobalTransform(source) {
        this.globalTransforms.delete(source);
    }

    registerProvider(source, moduleName, fn) {
        this.providers.set(source, {
            moduleName,
            fn
        });
    }

    unregisterProvider(source) {
        this.providers.delete(source);
    }

    clearAllForSource(source) {
        for (const state of this.members.values()) {
            state.contributions.delete(source);
        }
    }

    async pollProviders(member) {
        const state = this.stateFor(member.id);
        for (const [source, entry] of this.providers.entries()) {
            if (!this.isModuleEnabled(entry.moduleName)) {
                state.contributions.delete(source);
                continue;
            }
            let result;
            try {
                result = await entry.fn(member);
            } catch (e) {
                this.client.logger?.warn?.(`[nicknameManager] provider ${source} threw for ${member.id}: ${e.message}`);
                continue;
            }
            if (result === null || typeof result === 'undefined') {
                state.contributions.delete(source);
                continue;
            }
            const list = Array.isArray(result) ? result : [result];

            for (const key of [...state.contributions.keys()]) {
                if (key === source || key.startsWith(source + ':')) state.contributions.delete(key);
            }
            for (const c of list) {
                const key = c.source ?? source;
                const normalized = {
                    ...c,
                    source: key
                };
                if (typeof normalized.priority !== 'number') normalized.priority = 0;
                if (typeof normalized.exclusive !== 'boolean') normalized.exclusive = false;
                state.contributions.set(key, normalized);
            }
        }
    }

    isModuleEnabled(moduleName) {
        if (!moduleName) return true;
        const m = this.client.modules?.[moduleName];
        return !m || m.enabled !== false;
    }

    deriveBaseFromNickname(member, state, currentDecorations) {
        const current = member.nickname ?? member.user.displayName;
        const last = state?.lastDecorations;

        const patterns = (Array.isArray(last) && last.length > 0) ? last : currentDecorations;
        if (!Array.isArray(patterns) || patterns.length === 0) return current || member.user.displayName;
        const residue = this.stripDecorations(current, patterns);
        return residue || member.user.displayName;
    }

    stripDecorations(s, decorations) {
        if (!Array.isArray(decorations) || decorations.length === 0) return s;
        const wraps = decorations
            .filter(c => c.position === 'wrap')
            .sort((a, b) => a.priority - b.priority);
        for (const w of wraps) {
            try {
                if (typeof w.value !== 'function') continue;
                const sentinel = '__NICK_BASE__';
                const wrapped = w.value(sentinel);
                if (typeof wrapped !== 'string') continue;
                const idx = wrapped.indexOf(sentinel);
                if (idx === -1) continue;
                const before = wrapped.slice(0, idx);
                const after = wrapped.slice(idx + sentinel.length);
                if (s.startsWith(before) && s.endsWith(after) && s.length >= before.length + after.length) {
                    s = s.slice(before.length, s.length - after.length);
                }
            } catch {
            }
        }
        let prev;
        do {
            prev = s;
            for (const c of decorations) {

                if (c.position === 'prefix') {
                    if (c.match instanceof RegExp) {
                        const re = new RegExp('^(?:' + c.match.source + ')', c.match.flags.replace('g', ''));
                        const m = s.match(re);
                        if (m && m[0].length > 0) s = s.slice(m[0].length);
                    } else if (typeof c.value === 'string' && c.value && s.startsWith(c.value)) {
                        s = s.slice(c.value.length);
                    }
                }
                if (c.position === 'suffix') {
                    if (c.match instanceof RegExp) {
                        const re = new RegExp('(?:' + c.match.source + ')$', c.match.flags.replace('g', ''));
                        const m = s.match(re);
                        if (m && m[0].length > 0) s = s.slice(0, s.length - m[0].length);
                    } else if (typeof c.value === 'string' && c.value && s.endsWith(c.value)) {
                        s = s.slice(0, -c.value.length);
                    }
                }
            }
        } while (s !== prev);
        return s;
    }

    collectContributions(memberId) {
        const state = this.members.get(memberId);
        const perMember = state ? [...state.contributions.values()] : [];
        const globals = [...this.globalTransforms.entries()]
            .filter(([, g]) => this.isModuleEnabled(g.moduleName))
            .map(([source, g]) => ({
                source,
                position: g.position,
                value: g.value,
                priority: g.priority,
                exclusive: false
            }));
        return perMember.concat(globals);
    }

    render(member) {
        const all = this.collectContributions(member.id);

        function byPos(p) {
            return all.filter(c => c.position === p);
        }

        const bases = byPos('base').sort((a, b) => b.priority - a.priority);
        const memberState = this.members.get(member.id);
        const perMember = memberState ? [...memberState.contributions.values()] : [];
        const decorations = perMember.filter(c =>
            c.position === 'prefix' || c.position === 'suffix' || c.position === 'wrap'
        );
        let base = bases.length
            ? bases[0].value
            : this.deriveBaseFromNickname(member, memberState, decorations);

        const transforms = byPos('baseTransform').sort((a, b) => b.priority - a.priority);
        for (const t of transforms) base = t.value(base, member);

        function filterExclusive(list) {
            const exclusives = list.filter(c => c.exclusive).sort((a, b) => b.priority - a.priority);
            const nonExclusive = list.filter(c => !c.exclusive);
            const winner = exclusives[0];
            return [...(winner ? [winner] : []), ...nonExclusive];
        }

        const prefixGroup = filterExclusive(byPos('prefix'));
        const prefixWinner = prefixGroup.find(c => c.exclusive);
        const prefixRest = prefixGroup.filter(c => !c.exclusive).sort((a, b) => a.priority - b.priority);
        const prefixes = prefixWinner ? [prefixWinner, ...prefixRest] : prefixRest;

        const suffixGroup = filterExclusive(byPos('suffix'));
        const suffixWinner = suffixGroup.find(c => c.exclusive);
        const suffixRest = suffixGroup.filter(c => !c.exclusive).sort((a, b) => b.priority - a.priority);
        const suffixes = suffixWinner ? [suffixWinner, ...suffixRest] : suffixRest;

        const core = prefixes.map(c => c.value).join('') + base + suffixes.map(c => c.value).join('');

        const wraps = filterExclusive(byPos('wrap')).sort((a, b) => b.priority - a.priority);
        let result = core;
        for (const w of wraps) result = w.value(result);

        const codePoints = [...result];
        if (codePoints.length > 32) result = codePoints.slice(0, 32).join('');
        return result;
    }

    attachMember(member) {
        this.stateFor(member.id);

        this.memberRefs = this.memberRefs || new Map();
        this.memberRefs.set(member.id, member);
    }

    getLastRendered(memberId) {
        return this.members.get(memberId)?.lastRendered ?? null;
    }

    getContributions(memberId) {
        const s = this.members.get(memberId);
        return s ? [...s.contributions.values()] : [];
    }

    requestUpdate(memberId) {
        const state = this.stateFor(memberId);
        state.applyQueued = true;
        this.scheduleFlush(memberId);
    }

    scheduleFlush(memberId) {
        const state = this.stateFor(memberId);
        if (state.flushPending) return;
        state.flushPending = true;
        setImmediate(() => {
            state.flushPending = false;
            this.flushMember(memberId).catch(e => {
                this.client.logger?.warn?.(`[nicknameManager] flush error for ${memberId}: ${e.message}`);
            });
        });
    }

    async flushMember(memberId) {
        const state = this.stateFor(memberId);
        if (!state.applyQueued) return;
        state.applyQueued = false;

        const member = this.memberRefs?.get(memberId);
        if (!member) return;

        await this.pollProviders(member);

        const hasEnabledGlobalTransform = [...this.globalTransforms.values()]
            .some(g => this.isModuleEnabled(g.moduleName));
        const hasLastDecorations = Array.isArray(state.lastDecorations) && state.lastDecorations.length > 0;
        if (state.contributions.size === 0 && !hasEnabledGlobalTransform && !hasLastDecorations) {
            return;
        }

        const rendered = this.render(member);

        const current = member.nickname ?? member.user.displayName;
        if (rendered === current) {

            state.lastRendered = rendered;
            state.lastDecorations = this.snapshotDecorations(state);
            return;
        }

        if (state.pending) {
            try {
                await state.pending;
            } catch {
            }

            const reRendered = this.render(member);
            const reCurrent = member.nickname ?? member.user.displayName;
            if (reRendered === reCurrent) {
                state.lastRendered = reRendered;
                state.lastDecorations = this.snapshotDecorations(state);
                return;
            }
            state.pending = this.applySetNickname(member, reRendered, state);
            await state.pending;
            return;
        }

        state.pending = this.applySetNickname(member, rendered, state);
        await state.pending;
    }

    async applySetNickname(member, value, state) {
        try {
            await member.setNickname(value, '[nicknameManager] update');
            state.lastRendered = value;
            state.lastDecorations = this.snapshotDecorations(state);
        } catch (e) {
            this.client.logger?.warn?.(`[nicknameManager] setNickname failed for ${member.id} (target: "${value}"): ${e.message}`);
        } finally {
            state.pending = null;
        }
    }

    snapshotDecorations(state) {
        return [...state.contributions.values()].filter(c =>
            c.position === 'prefix' || c.position === 'suffix' || c.position === 'wrap'
        );
    }

    install() {
        if (this.installed) return;
        this.installed = true;

        this.client.on('configReload', () => this.handleConfigReload());
        this.client.on('botReady', () => {

            this.handleBotReady().catch(e => {
                this.client.logger?.warn?.(`[nicknameManager] bootstrap failed: ${e.message}`);
            });
        });
        this.client.on('guildMemberAdd', (member) => this.handleGuildMemberAdd(member));
        this.client.on('guildMemberUpdate', (oldM, newM) => this.handleGuildMemberUpdate(oldM, newM));
        this.client.on('guildMemberRemove', (member) => this.handleGuildMemberRemove(member));
    }

    handleGuildMemberRemove(member) {
        if (member.guild?.id && member.guild.id !== this.client.guild?.id) return;
        this.members.delete(member.id);
        this.memberRefs?.delete(member.id);
    }

    handleConfigReload() {

        for (const state of this.members.values()) {
            state.contributions.clear();
            state.lastRendered = null;
            state.lastDecorations = null;
            state.applyQueued = false;

        }
    }

    async handleBotReady() {
        const guild = this.client.guild;
        if (!guild) return;

        for (const member of guild.members.cache.values()) {
            this.attachMember(member);

            if (typeof this.bootstrapMemberHookFn === 'function') {
                try {
                    await this.bootstrapMemberHookFn(member);
                } catch (e) {
                    this.client.logger?.warn?.(`[nicknameManager] bootstrap hook failed for ${member.id}: ${e.message}`);
                }
            }

            const state = this.stateFor(member.id);
            state.applyQueued = true;
            try {
                await this.flushMember(member.id);
            } catch (e) {
                this.client.logger?.warn?.(`[nicknameManager] bootstrap flush failed for ${member.id}: ${e.message}`);
            }
        }
    }

    setBootstrapMemberHook(fn) {
        this.bootstrapMemberHookFn = fn;
    }

    handleGuildMemberAdd(member) {
        if (!this.client.botReadyAt) return;
        if (member.guild.id !== this.client.guild?.id) return;
        this.attachMember(member);
        this.requestUpdate(member.id);
    }

    handleGuildMemberUpdate(oldM, newM) {
        if (!this.client.botReadyAt) return;
        if (newM.partial || oldM.partial) return;
        if (newM.guild.id !== this.client.guild?.id) return;

        this.attachMember(newM);

        const nicknamesWillHandle = this.client.modules?.['nicknames']?.enabled === true;
        if (newM.nickname !== oldM.nickname && !nicknamesWillHandle) {
            this.requestUpdate(newM.id);
        }
    }
}

module.exports = NicknameManager;
