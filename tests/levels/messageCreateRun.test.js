/*
 * Tests for the messageCreate.run guard chain (modules/levels/events/
 * messageCreate.js). run() awards message XP via grantXPAndLevelUP, which is the
 * first thing to touch models.levels.User.findOne; we use that call as the probe
 * for "did we proceed past the guards". Covers: not-ready, bot/system authors,
 * no guild / wrong guild, missing member, prefix messages, blacklisted channel
 * (incl. parent), blacklisted role, the happy path, and the post-grant cooldown
 * that blocks an immediate second message. Helpers are mocked; LINEAR curve.
 */
const mainStub = require('../__stubs__/main');

jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn(),
    randomIntFromInterval: jest.fn(() => 10),
    randomElementFromArray: jest.fn((a) => a[0]),
    embedTypeV2: jest.fn(async (m) => m),
    formatDiscordUserName: (u) => u.username,
    formatNumber: (n) => String(n),
    todayInServerTZ: () => '2026-06-02',
    formatVoiceDuration: (s) => `${s}s`
}));
jest.mock('discord.js', () => ({ChannelType: {GuildText: 0}}));
jest.mock('../../modules/levels/leaderboardChannel', () => ({registerNeededEdit: jest.fn()}));

const handler = require('../../modules/levels/events/messageCreate');

// run() schedules a cooldown-clearing setTimeout; fake timers stop it leaking
// past the test (and let us assert the cooldown is active mid-window).
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});

let userFindOne;

function makeClient() {
    userFindOne = jest.fn().mockResolvedValue({
        userID: 'u1',
        xp: 0,
        level: 1,
        messages: 0,
        dailyMessages: 0,
        dailyVoiceSeconds: 0,
        dailyResetDate: '2026-06-02',
        save: jest.fn().mockResolvedValue()
    });
    const conf = {
        levels: {
            config: {
                curveType: 'LINEAR',
                startFromZero: false,
                maximumLevelEnabled: false,
                blacklisted_channels: [],
                blacklistedRoles: [],
                multiplication_roles: {},
                multiplication_channels: {},
                reward_roles: {},
                'min-xp': 10,
                'max-xp': 10,
                cooldown: 60000,
                levelUpMessagesConditions: 'all'
            },
            strings: {
                level_up_message: 'x',
                level_up_message_with_reward: 'y'
            },
            'special-levelup-messages': [],
            'random-levelup-messages': []
        }
    };
    mainStub.client.configurations = conf;
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        config: {prefix: '!'},
        configurations: conf,
        logger: {error: jest.fn()},
        channels: {cache: {find: () => null}},
        models: {
            levels: {
                User: {
                    findOne: userFindOne,
                    create: jest.fn()
                }
            }
        }
    };
}

function makeMsg({
                     content = 'hello',
                     authorId = 'u1',
                     bot = false,
                     system = false,
                     guildId = 'g1',
                     hasMember = true,
                     channelId = 'c1',
                     parentId = null
                 } = {}) {
    const roleCache = new Map();
    roleCache.some = () => false;
    roleCache.filter = () => ({values: () => [][Symbol.iterator]()});
    return {
        author: {
            id: authorId,
            bot,
            username: 'U',
            avatarURL: () => 'a',
            defaultAvatarURL: 'd'
        },
        system,
        guild: guildId ? {id: guildId} : null,
        member: hasMember ? {
            client: undefined,
            user: {
                id: authorId,
                username: 'U',
                avatarURL: () => 'a',
                defaultAvatarURL: 'd'
            },
            roles: {cache: roleCache}
        } : null,
        content,
        channel: {
            id: channelId,
            parentId,
            parent: null,
            send: jest.fn().mockResolvedValue()
        },
        reply: jest.fn().mockResolvedValue()
    };
}

function proceeded() {
    return userFindOne.mock.calls.length > 0;
}

test('ignores messages before the bot is ready', async () => {
    const client = makeClient();
    client.botReadyAt = null;
    await handler.run(client, makeMsg());
    expect(proceeded()).toBe(false);
});

test('ignores bot and system authors', async () => {
    let client = makeClient();
    await handler.run(client, makeMsg({bot: true}));
    expect(proceeded()).toBe(false);
    client = makeClient();
    await handler.run(client, makeMsg({system: true}));
    expect(proceeded()).toBe(false);
});

test('ignores messages without a guild or from the wrong guild', async () => {
    let client = makeClient();
    await handler.run(client, makeMsg({guildId: null}));
    expect(proceeded()).toBe(false);
    client = makeClient();
    await handler.run(client, makeMsg({guildId: 'other'}));
    expect(proceeded()).toBe(false);
});

test('ignores messages with no resolvable member', async () => {
    const client = makeClient();
    await handler.run(client, makeMsg({hasMember: false}));
    expect(proceeded()).toBe(false);
});

test('ignores messages containing the command prefix', async () => {
    const client = makeClient();
    await handler.run(client, makeMsg({content: 'do !thing'}));
    expect(proceeded()).toBe(false);
});

test('ignores messages in a blacklisted channel', async () => {
    const client = makeClient();
    client.configurations.levels.config.blacklisted_channels = ['c1'];
    const msg = makeMsg({channelId: 'c1'});
    msg.member.client = client;
    await handler.run(client, msg);
    expect(proceeded()).toBe(false);
});

test('ignores messages in a channel whose parent is blacklisted', async () => {
    const client = makeClient();
    client.configurations.levels.config.blacklisted_channels = ['cat'];
    const msg = makeMsg({
        channelId: 'c1',
        parentId: 'cat'
    });
    msg.member.client = client;
    await handler.run(client, msg);
    expect(proceeded()).toBe(false);
});

test('ignores members holding a blacklisted role', async () => {
    const client = makeClient();
    client.configurations.levels.config.blacklistedRoles = ['bad'];
    const msg = makeMsg();
    msg.member.roles.cache.some = (fn) => fn({id: 'bad'});
    msg.member.client = client;
    await handler.run(client, msg);
    expect(proceeded()).toBe(false);
});

test('awards xp on a normal message and then cools the author down', async () => {
    const client = makeClient();
    const msg = makeMsg({authorId: 'fresh'});
    msg.member.client = client;
    await handler.run(client, msg);
    expect(proceeded()).toBe(true);
    // Second immediate message from the same author is blocked by the cooldown set.
    userFindOne.mockClear();
    const msg2 = makeMsg({authorId: 'fresh'});
    msg2.member.client = client;
    await handler.run(client, msg2);
    expect(userFindOne).not.toHaveBeenCalled();
});