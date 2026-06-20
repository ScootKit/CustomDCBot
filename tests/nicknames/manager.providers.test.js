const NicknameManager = require('../../src/functions/nicknameManager');

/**
 * Builds a NicknameManager bound to a client stub with the given module map.
 * @param {Object} [modules]
 * @returns {NicknameManager}
 */
function makeManager(modules = {}) {
    return new NicknameManager({modules});
}

/**
 * Builds a minimal GuildMember-shaped object.
 * @param {string} id
 * @returns {Object}
 */
function makeMember(id) {
    return {
        id,
        nickname: null,
        user: {displayName: 'X'}
    };
}

describe('NicknameManager providers', () => {
    test('registerProvider stores provider with moduleName', () => {
        const m = makeManager();

        /**
         * Sample provider used to verify storage shape.
         * @returns {Promise<null>}
         */
        async function fn() {
            return null;
        }

        m.registerProvider('src-a', 'mod-a', fn);
        expect(m.providers.get('src-a')).toEqual({
            moduleName: 'mod-a',
            fn
        });
    });

    test('unregisterProvider removes provider', () => {
        const m = makeManager();
        m.registerProvider('src-a', 'mod-a', async () => null);
        m.unregisterProvider('src-a');
        expect(m.providers.has('src-a')).toBe(false);
    });

    test('clearAllForSource removes contribution from all members', () => {
        const m = makeManager();
        m.set('1', 'src-a', {
            position: 'suffix',
            value: ' A',
            priority: 1
        });
        m.set('2', 'src-a', {
            position: 'suffix',
            value: ' A',
            priority: 1
        });
        m.set('1', 'src-b', {
            position: 'suffix',
            value: ' B',
            priority: 1
        });
        m.clearAllForSource('src-a');
        expect(m.members.get('1').contributions.has('src-a')).toBe(false);
        expect(m.members.get('1').contributions.has('src-b')).toBe(true);
        expect(m.members.get('2').contributions.has('src-a')).toBe(false);
    });

    test('pollProviders runs all providers and stores results', async () => {
        const m = makeManager({'mod-a': {enabled: true}});
        m.registerProvider('src-a', 'mod-a', async () => ({
            position: 'suffix',
            value: ' A',
            priority: 1
        }));
        const member = makeMember('1');
        await m.pollProviders(member);
        expect(m.members.get('1').contributions.get('src-a').value).toBe(' A');
    });

    test('pollProviders skips providers from disabled modules', async () => {
        const m = makeManager({'mod-a': {enabled: false}});
        m.registerProvider('src-a', 'mod-a', async () => ({
            position: 'suffix',
            value: ' A',
            priority: 1
        }));
        const member = makeMember('1');
        await m.pollProviders(member);
        expect(m.members.get('1')?.contributions?.has('src-a')).toBeFalsy();
    });

    test('pollProviders supports providers returning arrays', async () => {
        const m = makeManager({'mod-a': {enabled: true}});
        m.registerProvider('src-a', 'mod-a', async () => [
            {
                source: 'src-a:1',
                position: 'prefix',
                value: 'P',
                priority: 10
            },
            {
                source: 'src-a:2',
                position: 'suffix',
                value: 'S',
                priority: 1
            }
        ]);
        const member = makeMember('1');
        await m.pollProviders(member);
        const c = m.members.get('1').contributions;
        expect(c.get('src-a:1').value).toBe('P');
        expect(c.get('src-a:2').value).toBe('S');
    });

    test('pollProviders clears prior contribution if provider returns null', async () => {
        const m = makeManager({'mod-a': {enabled: true}});
        let returnValue = {
            position: 'suffix',
            value: ' A',
            priority: 1
        };
        m.registerProvider('src-a', 'mod-a', async () => returnValue);
        const member = makeMember('1');
        await m.pollProviders(member);
        expect(m.members.get('1').contributions.has('src-a')).toBe(true);

        returnValue = null;
        await m.pollProviders(member);
        expect(m.members.get('1').contributions.has('src-a')).toBe(false);
    });
});