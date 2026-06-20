/*
 * Edge-case unit tests for NicknameManager that complement the existing
 * render / flush / providers / lifecycle suites. Focus areas:
 *   - pure helpers: stripDecorations, deriveBaseFromNickname, collectContributions
 *   - contribution normalization in set() / pollProviders()
 *   - global transform registration + module-enabled filtering
 *   - guard branches in attachMember / handleGuildMemberAdd / handleGuildMemberRemove
 *   - code-point-aware 32-char truncation
 */

const EventEmitter = require('events');
const NicknameManager = require('../../src/functions/nicknameManager');

/**
 * Minimal client stub.
 * @param {Object} [over]
 * @returns {Object}
 */
function makeClient(over = {}) {
    const client = new EventEmitter();
    client.modules = {};
    client.botReadyAt = new Date();
    client.guild = {
        id: 'g1',
        members: {cache: new Map()}
    };
    client.logger = {
        warn: jest.fn(),
        debug: jest.fn()
    };
    return Object.assign(client, over);
}

/**
 * GuildMember-shaped stub.
 * @param {string} id
 * @param {string} displayName
 * @param {string|null} [nickname]
 * @param {string} [guildId]
 * @returns {Object}
 */
function makeMember(id, displayName, nickname = null, guildId = 'g1') {
    return {
        id,
        nickname,
        user: {displayName},
        guild: {id: guildId},
        setNickname: jest.fn().mockResolvedValue(null),
        partial: false
    };
}

describe('set() normalization', () => {
    test('defaults priority to 0 and exclusive to false', () => {
        const m = new NicknameManager(makeClient());
        m.set('1', 'src', {
            position: 'suffix',
            value: ' X'
        });
        const c = m.members.get('1').contributions.get('src');
        expect(c.priority).toBe(0);
        expect(c.exclusive).toBe(false);
        expect(c.source).toBe('src');
    });

    test('preserves explicit priority/exclusive and marks state applyQueued', () => {
        const m = new NicknameManager(makeClient());
        m.set('1', 'src', {
            position: 'prefix',
            value: 'A',
            priority: 7,
            exclusive: true
        });
        const state = m.members.get('1');
        const c = state.contributions.get('src');
        expect(c.priority).toBe(7);
        expect(c.exclusive).toBe(true);
        expect(state.applyQueued).toBe(true);
    });

    test('a second set for the same source overwrites the prior contribution', () => {
        const m = new NicknameManager(makeClient());
        m.set('1', 'src', {
            position: 'suffix',
            value: ' A'
        });
        m.set('1', 'src', {
            position: 'suffix',
            value: ' B'
        });
        expect(m.members.get('1').contributions.size).toBe(1);
        expect(m.members.get('1').contributions.get('src').value).toBe(' B');
    });

    test('does not schedule a flush when the member has no live ref', () => {
        const m = new NicknameManager(makeClient());
        const spy = jest.spyOn(m, 'scheduleFlush');
        m.set('1', 'src', {
            position: 'suffix',
            value: ' X'
        });
        expect(spy).not.toHaveBeenCalled();
    });

    test('schedules a flush when the member already has a live ref', () => {
        const m = new NicknameManager(makeClient());
        m.attachMember(makeMember('1', 'Alice'));
        const spy = jest.spyOn(m, 'scheduleFlush');
        m.set('1', 'src', {
            position: 'suffix',
            value: ' X'
        });
        expect(spy).toHaveBeenCalledWith('1');
    });
});

describe('clear()', () => {
    test('clearing an unknown member is a no-op (no state created)', () => {
        const m = new NicknameManager(makeClient());
        expect(() => m.clear('ghost', 'src')).not.toThrow();
        expect(m.members.has('ghost')).toBe(false);
    });

    test('clear removes a contribution and marks applyQueued', () => {
        const m = new NicknameManager(makeClient());
        m.set('1', 'src', {
            position: 'suffix',
            value: ' X'
        });
        m.members.get('1').applyQueued = false;
        m.clear('1', 'src');
        expect(m.members.get('1').contributions.has('src')).toBe(false);
        expect(m.members.get('1').applyQueued).toBe(true);
    });
});

describe('clearAllForSource()', () => {
    test('removes a source from every member but leaves other sources intact', () => {
        const m = new NicknameManager(makeClient());
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥1'
        });
        m.set('1', 'afk', {
            position: 'prefix',
            value: '[AFK] '
        });
        m.set('2', 'streak', {
            position: 'suffix',
            value: ' 🔥2'
        });
        m.clearAllForSource('streak');
        expect(m.members.get('1').contributions.has('streak')).toBe(false);
        expect(m.members.get('1').contributions.has('afk')).toBe(true);
        expect(m.members.get('2').contributions.has('streak')).toBe(false);
    });
});

describe('global transforms', () => {
    test('registerGlobalTransform stores normalized entry with default priority 0', () => {
        const m = new NicknameManager(makeClient());
        const value = (s) => s.toUpperCase();
        m.registerGlobalTransform('san', 'sanitizer', {
            position: 'baseTransform',
            value
        });
        const g = m.globalTransforms.get('san');
        expect(g.moduleName).toBe('sanitizer');
        expect(g.position).toBe('baseTransform');
        expect(g.value).toBe(value);
        expect(g.priority).toBe(0);
    });

    test('registerGlobalTransform keeps an explicit priority', () => {
        const m = new NicknameManager(makeClient());
        m.registerGlobalTransform('san', 'sanitizer', {
            position: 'wrap',
            value: (s) => s,
            priority: 9
        });
        expect(m.globalTransforms.get('san').priority).toBe(9);
    });

    test('unregisterGlobalTransform removes the entry', () => {
        const m = new NicknameManager(makeClient());
        m.registerGlobalTransform('san', 'sanitizer', {
            position: 'baseTransform',
            value: (s) => s
        });
        m.unregisterGlobalTransform('san');
        expect(m.globalTransforms.has('san')).toBe(false);
    });

    test('collectContributions excludes globals from disabled modules', () => {
        const client = makeClient({modules: {sanitizer: {enabled: false}}});
        const m = new NicknameManager(client);
        m.registerGlobalTransform('san', 'sanitizer', {
            position: 'baseTransform',
            value: (s) => s
        });
        const all = m.collectContributions('1');
        expect(all.some(c => c.source === 'san')).toBe(false);
    });

    test('collectContributions includes globals from enabled modules with exclusive:false', () => {
        const client = makeClient({modules: {sanitizer: {enabled: true}}});
        const m = new NicknameManager(client);
        m.registerGlobalTransform('san', 'sanitizer', {
            position: 'baseTransform',
            value: (s) => s,
            priority: 3
        });
        const all = m.collectContributions('1');
        const g = all.find(c => c.source === 'san');
        expect(g).toMatchObject({
            position: 'baseTransform',
            priority: 3,
            exclusive: false
        });
    });
});

describe('isModuleEnabled()', () => {
    test('returns true for a falsy module name (core contributions)', () => {
        const m = new NicknameManager(makeClient());
        expect(m.isModuleEnabled(undefined)).toBe(true);
        expect(m.isModuleEnabled('')).toBe(true);
    });

    test('returns true for an unknown module', () => {
        const m = new NicknameManager(makeClient());
        expect(m.isModuleEnabled('nope')).toBe(true);
    });

    test('returns false only when the module is explicitly disabled', () => {
        const client = makeClient({
            modules: {
                a: {enabled: false},
                b: {enabled: true},
                c: {}
            }
        });
        const m = new NicknameManager(client);
        expect(m.isModuleEnabled('a')).toBe(false);
        expect(m.isModuleEnabled('b')).toBe(true);
        // enabled is undefined (not === false) -> treated as enabled
        expect(m.isModuleEnabled('c')).toBe(true);
    });
});

describe('stripDecorations()', () => {
    test('returns input unchanged when there are no decorations', () => {
        const m = new NicknameManager(makeClient());
        expect(m.stripDecorations('Alice', [])).toBe('Alice');
        expect(m.stripDecorations('Alice', null)).toBe('Alice');
    });

    test('strips a literal prefix and suffix', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('[VIP] Alice!', [
            {
                position: 'prefix',
                value: '[VIP] '
            },
            {
                position: 'suffix',
                value: '!'
            }
        ]);
        expect(out).toBe('Alice');
    });

    test('reverses a wrap via the sentinel trick', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('[AFK] Alice', [
            {
                position: 'wrap',
                value: (s) => '[AFK] ' + s,
                priority: 1
            }
        ]);
        expect(out).toBe('Alice');
    });

    test('skips a non-reversible wrap (sentinel not present in output)', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('Alice', [
            {
                position: 'wrap',
                value: () => 'constant',
                priority: 1
            }
        ]);
        expect(out).toBe('Alice');
    });

    test('skips a wrap whose value is not a function', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('xAlice', [
            {
                position: 'wrap',
                value: 'x',
                priority: 1
            }
        ]);
        // Non-function wrap is ignored, leaving the string untouched.
        expect(out).toBe('xAlice');
    });

    test('strips a regex-matched suffix whose literal value varies', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('Alice 🔥42', [
            {
                position: 'suffix',
                value: ' 🔥3',
                match: / 🔥\d+/
            }
        ]);
        expect(out).toBe('Alice');
    });

    test('strips a regex-matched prefix', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('##Alice', [
            {
                position: 'prefix',
                value: '#',
                match: /#+/
            }
        ]);
        expect(out).toBe('Alice');
    });

    test('loops until stable so stacked affixes from the same set strip cleanly', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('--Alice', [
            {
                position: 'prefix',
                value: '-'
            }
        ]);
        expect(out).toBe('Alice');
    });

    test('a regex match of zero length does not slice', () => {
        const m = new NicknameManager(makeClient());
        const out = m.stripDecorations('Alice', [
            {
                position: 'prefix',
                value: '',
                match: /x*/
            }
        ]);
        expect(out).toBe('Alice');
    });
});

describe('deriveBaseFromNickname()', () => {
    test('uses lastDecorations over current decorations when present', () => {
        const m = new NicknameManager(makeClient());
        const member = makeMember('1', 'Alice', '[OLD] Alice');
        const state = {
            lastDecorations: [{
                position: 'prefix',
                value: '[OLD] '
            }]
        };
        const out = m.deriveBaseFromNickname(member, state, [{
            position: 'prefix',
            value: '[NEW] '
        }]);
        expect(out).toBe('Alice');
    });

    test('falls back to current decorations on cold start (no lastDecorations)', () => {
        const m = new NicknameManager(makeClient());
        const member = makeMember('1', 'Alice', '[VIP] Alice');
        const out = m.deriveBaseFromNickname(member, {lastDecorations: null}, [{
            position: 'prefix',
            value: '[VIP] '
        }]);
        expect(out).toBe('Alice');
    });

    test('returns the current nickname when there are no patterns to strip', () => {
        const m = new NicknameManager(makeClient());
        const member = makeMember('1', 'Alice', 'Manual Name');
        const out = m.deriveBaseFromNickname(member, {lastDecorations: null}, []);
        expect(out).toBe('Manual Name');
    });

    test('uses displayName when member has no nickname and no patterns', () => {
        const m = new NicknameManager(makeClient());
        const member = makeMember('1', 'Alice', null);
        const out = m.deriveBaseFromNickname(member, null, []);
        expect(out).toBe('Alice');
    });

    test('falls back to displayName when stripping yields an empty residue', () => {
        const m = new NicknameManager(makeClient());
        const member = makeMember('1', 'Alice', '[VIP] ');
        const out = m.deriveBaseFromNickname(member, null, [{
            position: 'prefix',
            value: '[VIP] '
        }]);
        expect(out).toBe('Alice');
    });
});

describe('getLastRendered() / getContributions()', () => {
    test('getLastRendered returns null for an unknown member', () => {
        const m = new NicknameManager(makeClient());
        expect(m.getLastRendered('ghost')).toBe(null);
    });

    test('getLastRendered returns the stored value', () => {
        const m = new NicknameManager(makeClient());
        m.stateFor('1').lastRendered = 'Alice 🔥1';
        expect(m.getLastRendered('1')).toBe('Alice 🔥1');
    });

    test('getContributions returns [] for an unknown member', () => {
        const m = new NicknameManager(makeClient());
        expect(m.getContributions('ghost')).toEqual([]);
    });

    test('getContributions returns the live contribution list', () => {
        const m = new NicknameManager(makeClient());
        m.set('1', 'src', {
            position: 'suffix',
            value: ' X'
        });
        expect(m.getContributions('1')).toHaveLength(1);
        expect(m.getContributions('1')[0].source).toBe('src');
    });
});

describe('stateFor()', () => {
    test('creates an empty state on first access and reuses it', () => {
        const m = new NicknameManager(makeClient());
        const a = m.stateFor('1');
        const b = m.stateFor('1');
        expect(a).toBe(b);
        expect(a.contributions.size).toBe(0);
        expect(a.lastRendered).toBe(null);
        expect(a.applyQueued).toBe(false);
    });
});

describe('attachMember()', () => {
    test('stores the member ref and seeds state', () => {
        const m = new NicknameManager(makeClient());
        const member = makeMember('1', 'Alice');
        m.attachMember(member);
        expect(m.memberRefs.get('1')).toBe(member);
        expect(m.members.has('1')).toBe(true);
    });
});

describe('pollProviders() edge cases', () => {
    test('a throwing provider is caught, logged, and does not abort other providers', async () => {
        const client = makeClient({
            modules: {
                a: {enabled: true},
                b: {enabled: true}
            }
        });
        const m = new NicknameManager(client);
        m.registerProvider('a', 'a', async () => {
            throw new Error('boom');
        });
        m.registerProvider('b', 'b', async () => ({
            source: 'b',
            position: 'suffix',
            value: ' B'
        }));
        const member = makeMember('1', 'Alice');
        await m.pollProviders(member);
        expect(client.logger.warn).toHaveBeenCalled();
        expect(m.getContributions('1').some(c => c.source === 'b')).toBe(true);
    });

    test('a provider returning undefined clears its prior contribution', async () => {
        const client = makeClient({modules: {a: {enabled: true}}});
        const m = new NicknameManager(client);
        let value = {
            source: 'a',
            position: 'suffix',
            value: ' A'
        };
        m.registerProvider('a', 'a', async () => value);
        const member = makeMember('1', 'Alice');
        await m.pollProviders(member);
        expect(m.getContributions('1')).toHaveLength(1);
        value = undefined;
        await m.pollProviders(member);
        expect(m.getContributions('1')).toHaveLength(0);
    });

    test('a provider can shrink its sub-source contribution set between polls', async () => {
        const client = makeClient({modules: {a: {enabled: true}}});
        const m = new NicknameManager(client);
        let list = [
            {
                source: 'a:one',
                position: 'prefix',
                value: '1'
            },
            {
                source: 'a:two',
                position: 'prefix',
                value: '2'
            }
        ];
        m.registerProvider('a', 'a', async () => list);
        const member = makeMember('1', 'Alice');
        await m.pollProviders(member);
        expect(m.getContributions('1')).toHaveLength(2);
        // Provider now returns only one of its prior sub-sources.
        list = [{
            source: 'a:one',
            position: 'prefix',
            value: '1'
        }];
        await m.pollProviders(member);
        const sources = m.getContributions('1').map(c => c.source).sort();
        expect(sources).toEqual(['a:one']);
    });

    test('disabled provider modules have their prior contribution dropped', async () => {
        const client = makeClient({modules: {a: {enabled: true}}});
        const m = new NicknameManager(client);
        m.registerProvider('a', 'a', async () => ({
            source: 'a',
            position: 'suffix',
            value: ' A'
        }));
        const member = makeMember('1', 'Alice');
        await m.pollProviders(member);
        expect(m.getContributions('1')).toHaveLength(1);
        client.modules.a.enabled = false;
        await m.pollProviders(member);
        expect(m.getContributions('1')).toHaveLength(0);
    });

    test('provider contributions are normalized (default priority/exclusive)', async () => {
        const client = makeClient({modules: {a: {enabled: true}}});
        const m = new NicknameManager(client);
        m.registerProvider('a', 'a', async () => ({
            source: 'a',
            position: 'suffix',
            value: ' A'
        }));
        await m.pollProviders(makeMember('1', 'Alice'));
        const c = m.getContributions('1')[0];
        expect(c.priority).toBe(0);
        expect(c.exclusive).toBe(false);
    });
});

describe('render() truncation is code-point aware', () => {
    test('a surrogate-pair emoji on the 32-char boundary is not split', () => {
        const m = new NicknameManager(makeClient());
        // 31 ASCII chars + one emoji (2 code units, 1 code point) = 32 code points.
        const base = 'x'.repeat(31) + '😀';
        m.set('1', 'base', {
            position: 'base',
            value: base,
            priority: 100
        });
        const member = makeMember('1', 'Alice');
        const out = m.render(member);
        expect([...out]).toHaveLength(32);
        // The trailing emoji is intact, not a lone surrogate.
        expect(out.endsWith('😀')).toBe(true);
    });

    test('long names are truncated to 32 code points', () => {
        const m = new NicknameManager(makeClient());
        m.set('1', 'base', {
            position: 'base',
            value: 'y'.repeat(50),
            priority: 100
        });
        const out = m.render(makeMember('1', 'Alice'));
        expect([...out]).toHaveLength(32);
    });
});

describe('handleGuildMemberAdd guards', () => {
    test('ignores members of a different guild', () => {
        const m = new NicknameManager(makeClient());
        const spy = jest.spyOn(m, 'attachMember');
        m.handleGuildMemberAdd(makeMember('1', 'Alice', null, 'other'));
        expect(spy).not.toHaveBeenCalled();
    });

    test('ignores when bot is not ready', () => {
        const client = makeClient({botReadyAt: null});
        const m = new NicknameManager(client);
        const spy = jest.spyOn(m, 'attachMember');
        m.handleGuildMemberAdd(makeMember('1', 'Alice'));
        expect(spy).not.toHaveBeenCalled();
    });

    test('attaches and requests update for a home-guild member', () => {
        const m = new NicknameManager(makeClient());
        const attach = jest.spyOn(m, 'attachMember');
        const req = jest.spyOn(m, 'requestUpdate');
        m.handleGuildMemberAdd(makeMember('1', 'Alice'));
        expect(attach).toHaveBeenCalled();
        expect(req).toHaveBeenCalledWith('1');
    });
});

describe('handleGuildMemberRemove cross-guild guard', () => {
    test('does not drop state for a member from a different guild', () => {
        const m = new NicknameManager(makeClient());
        m.attachMember(makeMember('1', 'Alice'));
        m.handleGuildMemberRemove({
            id: '1',
            guild: {id: 'other'}
        });
        expect(m.members.has('1')).toBe(true);
        expect(m.memberRefs.has('1')).toBe(true);
    });

    test('drops state when guild is undefined (member.guild missing)', () => {
        const m = new NicknameManager(makeClient());
        m.attachMember(makeMember('1', 'Alice'));
        // No guild.id -> guard short-circuits the early return and removal happens.
        m.handleGuildMemberRemove({
            id: '1',
            guild: undefined
        });
        expect(m.members.has('1')).toBe(false);
    });
});

describe('requestUpdate()', () => {
    test('marks applyQueued and schedules a flush', () => {
        const m = new NicknameManager(makeClient());
        const spy = jest.spyOn(m, 'scheduleFlush');
        m.requestUpdate('1');
        expect(m.stateFor('1').applyQueued).toBe(true);
        expect(spy).toHaveBeenCalledWith('1');
    });
});

describe('handleBotReady() with no guild', () => {
    test('returns early when client.guild is missing', async () => {
        const client = makeClient({guild: null});
        const m = new NicknameManager(client);
        await expect(m.handleBotReady()).resolves.toBeUndefined();
        expect(m.members.size).toBe(0);
    });
});