/*
 * Tests for the afk-system nickname provider (modules/afk-system/onLoad.js).
 *
 * onLoad registers a provider (once) that wraps a member's nickname in "[AFK]"
 * when they have an active AFK session. Covers:
 *  - idempotent registration
 *  - an active session yields a wrap descriptor whose value prefixes "[AFK] "
 *  - no session / missing model yields null
 */

const onLoad = require('../../modules/afk-system/onLoad').onLoad;

function makeClient({
                        session,
                        model = 'present'
                    } = {}) {
    const providers = {};
    return {
        _providers: providers,
        nicknameManager: {
            registerProvider: jest.fn((source, mod, fn) => {
                providers[source] = fn;
            })
        },
        models: model === 'present'
            ? {'afk-system': {AFKUser: {findOne: jest.fn().mockResolvedValue(session)}}}
            : {}
    };
}

test('registers the afk provider only once', () => {
    const client = makeClient({session: null});
    onLoad(client);
    onLoad(client);
    expect(client.nicknameManager.registerProvider).toHaveBeenCalledTimes(1);
});

test('wraps the nickname with [AFK] when a session exists', async () => {
    const client = makeClient({session: {userID: 'm1'}});
    onLoad(client);
    const result = await client._providers['afk']({id: 'm1'});
    expect(result).toMatchObject({
        source: 'afk',
        position: 'wrap',
        priority: 500
    });
    expect(result.value('Bob')).toBe('[AFK] Bob');
});

test('returns null when the member has no session', async () => {
    const client = makeClient({session: null});
    onLoad(client);
    expect(await client._providers['afk']({id: 'm1'})).toBeNull();
});

test('returns null when the AFKUser model is unavailable', async () => {
    const client = makeClient({model: 'missing'});
    onLoad(client);
    expect(await client._providers['afk']({id: 'm1'})).toBeNull();
});