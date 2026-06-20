const NicknameManager = require('../../src/functions/nicknameManager');

/**
 * Builds a fresh NicknameManager bound to a minimal client stub.
 * @returns {NicknameManager}
 */
function makeManager() {
    const client = {user: {displayName: 'fallback'}};
    return new NicknameManager(client);
}

/**
 * Builds a minimal GuildMember-shaped object for render tests.
 * @param {string} id
 * @param {string} displayName
 * @param {string|null} [nickname]
 * @returns {Object}
 */
function makeMember(id, displayName, nickname) {
    return {
        id,
        nickname: nickname ?? null,
        user: {displayName}
    };
}

describe('NicknameManager.render', () => {
    test('returns displayName when no contributions', () => {
        const m = makeManager();
        expect(m.render(makeMember('1', 'Alice'))).toBe('Alice');
    });

    test('uses highest-priority base contribution', () => {
        const m = makeManager();
        m.set('1', 'src-a', {
            position: 'base',
            value: 'A',
            priority: 10
        });
        m.set('1', 'src-b', {
            position: 'base',
            value: 'B',
            priority: 100
        });
        expect(m.render(makeMember('1', 'X'))).toBe('B');
    });

    test('appends suffix to base', () => {
        const m = makeManager();
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥3',
            priority: 1
        });
        expect(m.render(makeMember('1', 'Alice'))).toBe('Alice 🔥3');
    });

    test('prepends prefix to base', () => {
        const m = makeManager();
        m.set('1', 'role', {
            position: 'prefix',
            value: '[VIP] ',
            priority: 10
        });
        expect(m.render(makeMember('1', 'Alice'))).toBe('[VIP] Alice');
    });

    test('combines prefix + base + suffix', () => {
        const m = makeManager();
        m.set('1', 'role-pre', {
            position: 'prefix',
            value: '[VIP] ',
            priority: 10
        });
        m.set('1', 'role-suf', {
            position: 'suffix',
            value: ' ❤',
            priority: 10
        });
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥3',
            priority: 1
        });
        expect(m.render(makeMember('1', 'Alice'))).toBe('[VIP] Alice ❤ 🔥3');
    });

    test('multiple prefixes order by priority desc (highest closest to base)', () => {
        const m = makeManager();
        m.set('1', 'outer', {
            position: 'prefix',
            value: '<<',
            priority: 1
        });
        m.set('1', 'inner', {
            position: 'prefix',
            value: '>>',
            priority: 10
        });
        expect(m.render(makeMember('1', 'X'))).toBe('<<>>X');
    });

    test('baseTransform mutates base before prefix/suffix', () => {
        const m = makeManager();
        m.set('1', 'sanitize', {
            position: 'baseTransform',
            value: (b) => b.toUpperCase(),
            priority: 50
        });
        m.set('1', 'role', {
            position: 'prefix',
            value: '[VIP] ',
            priority: 10
        });
        expect(m.render(makeMember('1', 'alice'))).toBe('[VIP] ALICE');
    });

    test('wrap runs after assembly', () => {
        const m = makeManager();
        m.set('1', 'role', {
            position: 'prefix',
            value: '[VIP] ',
            priority: 10
        });
        m.set('1', 'mute', {
            position: 'wrap',
            value: (s) => '[Muted] ' + s,
            priority: 1000
        });
        expect(m.render(makeMember('1', 'Alice'))).toBe('[Muted] [VIP] Alice');
    });

    test('two wraps stack innermost-first by priority desc', () => {
        const m = makeManager();
        m.set('1', 'inner', {
            position: 'wrap',
            value: (s) => '<' + s + '>',
            priority: 100
        });
        m.set('1', 'outer', {
            position: 'wrap',
            value: (s) => '[' + s + ']',
            priority: 10
        });
        expect(m.render(makeMember('1', 'X'))).toBe('[<X>]');
    });

    test('exclusive prefix: highest-priority exclusive wins, non-exclusive still renders', () => {
        const m = makeManager();
        m.set('1', 'ex-low', {
            position: 'prefix',
            value: 'L',
            priority: 1,
            exclusive: true
        });
        m.set('1', 'ex-high', {
            position: 'prefix',
            value: 'H',
            priority: 100,
            exclusive: true
        });
        m.set('1', 'free', {
            position: 'prefix',
            value: 'F',
            priority: 50
        });

        /*
         * Exclusive group: H wins over L. Non-exclusive F always renders.
         * Ordering of all rendered prefixes: exclusive winner H first, then F.
         */
        expect(m.render(makeMember('1', 'X'))).toBe('HFX');
    });

    test('truncates to 32 chars', () => {
        const m = makeManager();
        m.set('1', 'pre', {
            position: 'prefix',
            value: 'PREFIX-LONG-',
            priority: 10
        });
        expect(m.render(makeMember('1', 'BaseNameThatIsAlsoQuiteLong'))).toHaveLength(32);
    });

    test('global baseTransform applies to all members', () => {
        const m = makeManager();
        m.registerGlobalTransform('cleaner', 'name-list-cleaner', {
            position: 'baseTransform',
            value: (b) => b.replace(/^[^A-Z]+/, ''),
            priority: 50
        });
        // No per-member contribution; uses displayName as base.
        expect(m.render(makeMember('1', '!!!Alice'))).toBe('Alice');
    });

    test('global wrap applies to all members', () => {
        const m = makeManager();
        m.registerGlobalTransform('decorator', 'some-module', {
            position: 'wrap',
            value: (s) => '*' + s + '*',
            priority: 1
        });
        expect(m.render(makeMember('1', 'X'))).toBe('*X*');
    });

    test('baseTransform value receives member as second argument', () => {
        const m = makeManager();
        const seen = [];
        m.registerGlobalTransform('inspector', 'some-module', {
            position: 'baseTransform',
            value: (base, member) => {
                seen.push({
                    base,
                    memberId: member?.id
                });
                return base;
            },
            priority: 10
        });
        m.render(makeMember('42', 'Alice'));
        expect(seen).toEqual([{
            base: 'Alice',
            memberId: '42'
        }]);
    });
});