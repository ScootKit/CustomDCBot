/*
 * Tests for the voiceStateUpdate.run guard chain (modules/levels/events/
 * voiceStateUpdate.js). run() only does work when a real channel/mute/deaf change
 * happened in this guild with voice XP enabled. We probe "did we proceed" by
 * whether the new channel's members collection was iterated (updateChannelSessions
 * calls channel.members.values()). Covers: not-ready, no-guild/bot member, wrong
 * guild, voiceXPPerMinute=0, and the no-change early return; plus the proceed
 * case on an actual join. grantXPAndLevelUP's deps are mocked away via helpers.
 */
const mainStub = require('../__stubs__/main');
jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn(),
    randomIntFromInterval: jest.fn(() => 1),
    randomElementFromArray: (a) => a[0],
    embedTypeV2: jest.fn(async (m) => m),
    formatDiscordUserName: (u) => u.username,
    formatNumber: (n) => String(n),
    todayInServerTZ: () => '2026-06-02',
    formatVoiceDuration: (s) => `${s}s`
}));
jest.mock('discord.js', () => ({
    ChannelType: {
        GuildVoice: 2,
        GuildStageVoice: 13
    }
}));

const handler = require('../../modules/levels/events/voiceStateUpdate');

afterEach(() => jest.useRealTimers());

function makeClient(voiceXP = 1) {
    const conf = {
        levels: {
            config: {
                voiceXPPerMinute: voiceXP,
                blacklisted_channels: [],
                blacklistedRoles: []
            }
        }
    };
    mainStub.client.configurations = conf;
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        configurations: conf,
        logger: {error: jest.fn()}
    };
}

let iterated;

function makeChannel(id, members = []) {
    return {
        id,
        members: {
            values: () => {
                iterated = true;
                return members[Symbol.iterator]();
            },
            filter: (fn) => ({size: members.filter(fn).length})
        }
    };
}

function state({
                   channel = null,
                   guildId = 'g1',
                   bot = false,
                   deaf = false,
                   mute = false,
                   memberId = 'm1'
               } = {}) {
    return {
        guild: guildId ? {id: guildId} : null,
        channel,
        deaf,
        mute,
        member: {
            id: memberId,
            user: {bot},
            voice: {},
            roles: {cache: {some: () => false}}
        }
    };
}

beforeEach(() => {
    iterated = false;
});

test('ignores when the bot is not ready', async () => {
    const client = makeClient();
    client.botReadyAt = null;
    await handler.run(client, state(), state({channel: makeChannel('v1')}));
    expect(iterated).toBe(false);
});

test('ignores a bot member', async () => {
    await handler.run(makeClient(), state({bot: true}), state({
        channel: makeChannel('v1'),
        bot: true
    }));
    expect(iterated).toBe(false);
});

test('ignores the wrong guild', async () => {
    await handler.run(makeClient(), state(), state({
        channel: makeChannel('v1'),
        guildId: 'other'
    }));
    expect(iterated).toBe(false);
});

test('ignores when voiceXPPerMinute is 0', async () => {
    await handler.run(makeClient(0), state(), state({channel: makeChannel('v1')}));
    expect(iterated).toBe(false);
});

test('returns early when neither channel nor mute/deaf changed', async () => {
    const chan = makeChannel('v1');
    await handler.run(makeClient(), state({channel: chan}), state({channel: chan}));
    expect(iterated).toBe(false);
});

test('proceeds to scan the new channel on a genuine join', async () => {
    jest.useFakeTimers();
    const chan = makeChannel('v1', []); // empty -> no eligible member, but it is still iterated
    await handler.run(makeClient(), state({channel: null}), state({channel: chan}));
    expect(iterated).toBe(true);
});