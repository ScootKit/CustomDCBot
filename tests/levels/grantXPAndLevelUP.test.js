/*
 * Tests for grantXPAndLevelUP (modules/levels/events/messageCreate.js), the core
 * XP-grant + level-up engine. Covers:
 *   - blacklisted-role short circuit.
 *   - lazy user creation, message-count increment for the 'message' type.
 *   - daily counter reset when the stored date is stale, and the voice
 *     accumulation path.
 *   - role-factor and channel-multiplier XP scaling.
 *   - the level-up path (single and multi-level jumps), reward-role granting,
 *     onlyTopLevelRole removal, and the corrupted-values safety abort.
 *   - levelUpMessagesConditions gating of the announcement.
 * Curve config is LINEAR (xp = level*750) so thresholds are deterministic.
 */
const mainStub = require('../__stubs__/main');

jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((i) => i),
    randomIntFromInterval: jest.fn(() => 1),
    randomElementFromArray: jest.fn((arr) => arr[0]),
    embedTypeV2: jest.fn(async (m) => ({_msg: m})),
    formatDiscordUserName: (u) => u.username,
    formatNumber: (n) => String(n),
    todayInServerTZ: () => '2026-06-02',
    formatVoiceDuration: (s) => `${s}s`
}));
jest.mock('discord.js', () => ({ChannelType: {GuildText: 0}}));

const {grantXPAndLevelUP} = require('../../modules/levels/events/messageCreate');

function config(overrides = {}) {
    return {
        curveType: 'LINEAR',
        startFromZero: false,
        maximumLevelEnabled: false,
        blacklistedRoles: [],
        multiplication_roles: {},
        multiplication_channels: {},
        reward_roles: {},
        onlyTopLevelRole: false,
        level_up_channel_id: null,
        levelUpMessagesConditions: 'all',
        randomMessages: false,
        ...overrides
    };
}

function makeClient({
                        cfg = {},
                        user,
                        channels = []
                    } = {}) {
    const conf = {
        levels: {
            config: config(cfg),
            strings: {
                level_up_message: 'LVLUP',
                level_up_message_with_reward: 'LVLUP_REWARD'
            },
            'special-levelup-messages': [],
            'random-levelup-messages': []
        }
    };
    // grantXPAndLevelUP closes over the module-level main client for the CUSTOM
    // curve; mirror config there too so any lookups resolve.
    mainStub.client.configurations = conf;
    const channelCache = {find: (fn) => channels.find(fn)};
    return {
        configurations: conf,
        logger: {error: jest.fn()},
        channels: {cache: channelCache},
        models: {
            levels: {
                User: {
                    findOne: jest.fn().mockResolvedValue(user),
                    create: jest.fn(async (vals) => ({
                        level: 1,
                        dailyMessages: 0,
                        dailyVoiceSeconds: 0,
                        dailyResetDate: null, ...vals,
                        save: jest.fn().mockResolvedValue()
                    }))
                }
            }
        }
    };
}

function makeMember({roleIds = []} = {}) {
    const cache = new Map(roleIds.map(id => [id, {id}]));
    cache.some = (fn) => [...cache.values()].some(fn);
    cache.has = (id) => [...cache.keys()].includes(id);
    cache.filter = (fn) => {
        const arr = [...cache.values()].filter(fn);
        return {values: () => arr[Symbol.iterator]()};
    };
    return {
        // getMemberRoleFactor reads member.client.configurations; default to the
        // shared main stub so members work even when a test doesn't relink it.
        client: mainStub.client,
        user: {
            id: 'u1',
            username: 'U',
            avatarURL: () => 'a',
            defaultAvatarURL: 'd'
        },
        roles: {
            cache,
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue()
        }
    };
}

function userRow(over = {}) {
    return {
        userID: 'u1',
        xp: 0,
        level: 1,
        messages: 0,
        dailyMessages: 0,
        dailyVoiceSeconds: 0,
        dailyResetDate: '2026-06-02',
        save: jest.fn().mockResolvedValue(), ...over
    };
}

test('short-circuits for a member holding a blacklisted role', async () => {
    const client = makeClient({cfg: {blacklistedRoles: ['bad']}});
    const member = makeMember({roleIds: ['bad']});
    await grantXPAndLevelUP(client, member, 100, 'message', {id: 'c'});
    expect(client.models.levels.User.findOne).not.toHaveBeenCalled();
});

test('creates the user row lazily and increments the message count', async () => {
    const client = makeClient({user: null});
    const member = makeMember();
    const channel = {
        id: 'c',
        send: jest.fn().mockResolvedValue()
    };
    await grantXPAndLevelUP(client, member, 10, 'message', channel);
    expect(client.models.levels.User.create).toHaveBeenCalled();
});

test('adds plain xp without leveling up when below the next threshold', async () => {
    const user = userRow({
        xp: 0,
        level: 1
    });
    const client = makeClient({user});
    const member = makeMember();
    const channel = {
        id: 'c',
        send: jest.fn().mockResolvedValue()
    };
    await grantXPAndLevelUP(client, member, 100, 'message', channel); // 100 < 1500 (level 2)
    expect(user.xp).toBe(100);
    expect(user.messages).toBe(1);
    expect(channel.send).not.toHaveBeenCalled();
});

test('resets the daily counters when the stored reset date is stale', async () => {
    const user = userRow({
        dailyResetDate: '2020-01-01',
        dailyMessages: 99,
        dailyVoiceSeconds: 999
    });
    const client = makeClient({user});
    const member = makeMember();
    await grantXPAndLevelUP(client, member, 10, 'message', {
        id: 'c',
        send: jest.fn()
    });
    expect(user.dailyResetDate).toBe('2026-06-02');
    expect(user.dailyMessages).toBe(1); // reset to 0 then +1 for this message
});

test('accumulates daily voice seconds for the voice type', async () => {
    const user = userRow();
    const client = makeClient({user});
    const member = makeMember();
    await grantXPAndLevelUP(client, member, 10, 'voice', {
        id: 'c',
        send: jest.fn()
    }, null, 90);
    expect(user.dailyVoiceSeconds).toBe(90);
    expect(user.messages).toBe(0); // voice does not bump message count
});

test('scales xp by role factor and channel multiplier', async () => {
    const user = userRow();
    const client = makeClient({
        user,
        cfg: {
            multiplication_roles: {boost: '2'},
            multiplication_channels: {c: '3'}
        }
    });
    const member = makeMember({roleIds: ['boost']});
    member.client = client;
    await grantXPAndLevelUP(client, member, 10, 'message', {
        id: 'c',
        send: jest.fn()
    });
    expect(user.xp).toBe(60); // 10 * 2 (role) * 3 (channel)
});

test('levels up a single level and announces in the channel', async () => {
    const user = userRow({
        xp: 0,
        level: 1
    });
    const client = makeClient({user});
    const member = makeMember();
    const channel = {
        id: 'c',
        send: jest.fn().mockResolvedValue()
    };
    await grantXPAndLevelUP(client, member, 1500, 'message', channel); // reaches level 2
    expect(user.level).toBe(2);
    expect(channel.send).toHaveBeenCalled();
});

test('jumps multiple levels at once when xp overshoots', async () => {
    const user = userRow({
        xp: 0,
        level: 1
    });
    const client = makeClient({user});
    const member = makeMember();
    await grantXPAndLevelUP(client, member, 3000, 'message', {
        id: 'c',
        send: jest.fn().mockResolvedValue()
    });
    expect(user.level).toBe(4); // 3000 -> level 4 (4*750)
});

test('grants the reward role for the reached level', async () => {
    const user = userRow({
        xp: 0,
        level: 1
    });
    const client = makeClient({
        user,
        cfg: {reward_roles: {'2': 'roleTwo'}}
    });
    const member = makeMember();
    await grantXPAndLevelUP(client, member, 1500, 'message', {
        id: 'c',
        send: jest.fn().mockResolvedValue()
    });
    expect(member.roles.add).toHaveBeenCalledWith('roleTwo', expect.any(String));
});

test('onlyTopLevelRole removes previously held reward roles before adding', async () => {
    const user = userRow({
        xp: 0,
        level: 1
    });
    const client = makeClient({
        user,
        cfg: {
            onlyTopLevelRole: true,
            reward_roles: {'2': 'roleTwo'}
        }
    });
    const member = makeMember({roleIds: ['roleTwo']});
    await grantXPAndLevelUP(client, member, 1500, 'message', {
        id: 'c',
        send: jest.fn().mockResolvedValue()
    });
    expect(member.roles.remove).toHaveBeenCalledWith('roleTwo', expect.any(String));
});

test('aborts the level-up loop for corrupted stored values', async () => {
    const user = userRow({
        xp: Infinity,
        level: 1
    });
    const client = makeClient({user});
    const member = makeMember();
    const channel = {
        id: 'c',
        send: jest.fn()
    };
    await grantXPAndLevelUP(client, member, 1500, 'message', channel);
    expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('corrupted values'));
    expect(channel.send).not.toHaveBeenCalled();
});

test('suppresses the announcement when levelUpMessagesConditions is none', async () => {
    const user = userRow({
        xp: 0,
        level: 1
    });
    const client = makeClient({
        user,
        cfg: {levelUpMessagesConditions: 'none'}
    });
    const member = makeMember();
    const channel = {
        id: 'c',
        send: jest.fn()
    };
    await grantXPAndLevelUP(client, member, 1500, 'message', channel);
    expect(user.level).toBe(2); // still levels up
    expect(channel.send).not.toHaveBeenCalled(); // but no message
});

test('only-role-rewards condition suppresses non-reward level-ups', async () => {
    const user = userRow({
        xp: 0,
        level: 1
    });
    const client = makeClient({
        user,
        cfg: {
            levelUpMessagesConditions: 'only-role-rewards',
            reward_roles: {}
        }
    });
    const member = makeMember();
    const channel = {
        id: 'c',
        send: jest.fn()
    };
    await grantXPAndLevelUP(client, member, 1500, 'message', channel);
    expect(channel.send).not.toHaveBeenCalled();
});