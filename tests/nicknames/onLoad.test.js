/*
 * Tests for nicknames onLoad: registers a single provider + a bootstrap hook,
 * guards against double registration, and exercises the provider's output:
 *  - returns null when config/strings are missing
 *  - base name from stored nickname vs forceDisplayname
 *  - highest-position matching role contributes prefix/suffix
 * Also checks the bootstrap hook skips a disabled module.
 */
const mockPersist = jest.fn().mockResolvedValue();
jest.mock('../../modules/nicknames/persistExternalEditAsBase', () => ({
    persistExternalEditAsBase: (...a) => mockPersist(...a)
}));

const {onLoad} = require('../../modules/nicknames/onLoad');

function makeClient({
                        config,
                        strings,
                        stored = null,
                        modules = {}
                    } = {}) {
    let provider = null;
    let bootstrapHook = null;
    const client = {
        modules,
        configurations: {
            nicknames: {
                config,
                strings
            }
        },
        models: {nicknames: {User: {findOne: jest.fn().mockResolvedValue(stored)}}},
        nicknameManager: {
            registerProvider: jest.fn((source, name, fn) => {
                provider = fn;
            }),
            setBootstrapMemberHook: jest.fn((fn) => {
                bootstrapHook = fn;
            })
        }
    };
    onLoad(client);
    return {
        client,
        getProvider: () => provider,
        getHook: () => bootstrapHook
    };
}

function makeMember({
                        id = 'm1',
                        displayName = 'Display',
                        roles = []
                    } = {}) {
    return {
        id,
        user: {displayName},
        roles: {cache: {values: () => roles[Symbol.iterator]()}}
    };
}

beforeEach(() => mockPersist.mockClear());

test('registers a provider and a bootstrap hook once', () => {
    const {client} = makeClient({
        config: {},
        strings: []
    });
    expect(client.nicknameManager.registerProvider).toHaveBeenCalledTimes(1);
    expect(client.nicknameManager.setBootstrapMemberHook).toHaveBeenCalledTimes(1);
    expect(client.nicknamesProviderRegistered).toBe(true);
});

test('does not register twice', () => {
    const {client} = makeClient({
        config: {},
        strings: []
    });
    onLoad(client);
    expect(client.nicknameManager.registerProvider).toHaveBeenCalledTimes(1);
});

describe('provider output', () => {
    test('returns null when config or strings are missing', async () => {
        const {getProvider} = makeClient({
            config: undefined,
            strings: undefined
        });
        expect(await getProvider()(makeMember())).toBeNull();
    });

    test('uses the stored nickname as the base name', async () => {
        const {getProvider} = makeClient({
            config: {forceDisplayname: false},
            strings: [],
            stored: {nickname: 'StoredName'}
        });
        const out = await getProvider()(makeMember({displayName: 'Display'}));
        const base = out.find(c => c.position === 'base');
        expect(base.value).toBe('StoredName');
    });

    test('forceDisplayname overrides the stored nickname', async () => {
        const {getProvider} = makeClient({
            config: {forceDisplayname: true},
            strings: [],
            stored: {nickname: 'StoredName'}
        });
        const out = await getProvider()(makeMember({displayName: 'Display'}));
        expect(out.find(c => c.position === 'base').value).toBe('Display');
    });

    test('falls back to displayName when there is no stored row', async () => {
        const {getProvider} = makeClient({
            config: {},
            strings: [],
            stored: null
        });
        const out = await getProvider()(makeMember({displayName: 'Display'}));
        expect(out.find(c => c.position === 'base').value).toBe('Display');
    });

    test('contributes prefix/suffix from the highest-position matching role', async () => {
        const strings = [
            {
                roleID: 'low',
                prefix: '[L] '
            },
            {
                roleID: 'high',
                prefix: '[H] ',
                suffix: ' !'
            }
        ];
        const {getProvider} = makeClient({
            config: {},
            strings,
            stored: {nickname: 'N'}
        });
        const roles = [
            {
                id: 'low',
                position: 1
            },
            {
                id: 'high',
                position: 9
            }
        ];
        const out = await getProvider()(makeMember({roles}));
        const prefix = out.find(c => c.position === 'prefix');
        const suffix = out.find(c => c.position === 'suffix');
        expect(prefix.value).toBe('[H] ');
        expect(suffix.value).toBe(' !');
    });

    test('omits prefix/suffix when no role matches', async () => {
        const {getProvider} = makeClient({
            config: {},
            strings: [{
                roleID: 'x',
                prefix: '[X] '
            }],
            stored: {nickname: 'N'}
        });
        const out = await getProvider()(makeMember({
            roles: [{
                id: 'y',
                position: 1
            }]
        }));
        expect(out.some(c => c.position === 'prefix')).toBe(false);
    });
});

describe('bootstrap hook', () => {
    test('persists the base for an enabled module', async () => {
        const {
            getHook,
            client
        } = makeClient({
            config: {},
            strings: [],
            modules: {nicknames: {enabled: true}}
        });
        const member = makeMember();
        await getHook()(member);
        expect(mockPersist).toHaveBeenCalledWith(client, member);
    });

    test('skips persistence when the module is disabled', async () => {
        const {getHook} = makeClient({
            config: {},
            strings: [],
            modules: {nicknames: {enabled: false}}
        });
        await getHook()(makeMember());
        expect(mockPersist).not.toHaveBeenCalled();
    });
});