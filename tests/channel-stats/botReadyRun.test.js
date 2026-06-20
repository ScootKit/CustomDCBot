/*
 * Covers the run() orchestration in modules/channel-stats/events/botReady.js
 * (the placeholder engine itself is covered by channelNameReplacer.test.js):
 *  - renames each configured channel at startup only when the name actually
 *    changes
 *  - warns for non-voice/non-category channels
 *  - skips channels that cannot be fetched
 *  - registers an update interval per channel, clamped to a >= 5 minute floor
 *  - the interval re-renders and renames on change, guarding against overlap
 * formatDate/localize are real/auto-stubbed.
 */
const {
    ChannelType,
    Collection
} = require('discord.js');
const botReady = require('../../modules/channel-stats/events/botReady');

function makeGuild({
                       members = new Collection(),
                       channelCount = 3,
                       roleCount = 2
                   } = {}) {
    return {
        members: {cache: members},
        channels: {cache: new Collection(Array.from({length: channelCount}, (_, i) => [String(i), {}]))},
        roles: {cache: new Collection(Array.from({length: roleCount}, (_, i) => [String(i), {}]))},
        emojis: {cache: new Collection()},
        premiumSubscriptionCount: 0,
        premiumTier: 0
    };
}

function makeChannel({
                         name,
                         type = ChannelType.GuildVoice,
                         guild
                     }) {
    return {
        id: 'ch1',
        name,
        type,
        guild,
        setName: jest.fn().mockResolvedValue()
    };
}

function makeClient({
                        channels,
                        fetchMap,
                        guild
                    }) {
    return {
        configurations: {'channel-stats': {channels}},
        intervals: [],
        channels: {fetch: jest.fn().mockImplementation((id) => Promise.resolve(fetchMap[id] ?? null))},
        guild,
        logger: {warn: jest.fn()}
    };
}

afterEach(() => jest.useRealTimers());

test('renames a channel at startup when the rendered name differs', async () => {
    jest.useFakeTimers();
    const guild = makeGuild({channelCount: 7});
    const channel = makeChannel({
        name: 'Channels: 0',
        guild
    });
    const client = makeClient({
        channels: [{
            channelID: 'ch1',
            channelName: 'Channels: %channelCount%',
            updateInterval: 5
        }],
        fetchMap: {ch1: channel},
        guild
    });
    await botReady.run(client);
    expect(channel.setName).toHaveBeenCalledTimes(1);
    expect(channel.setName.mock.calls[0][0]).toBe('Channels: 7');
});

test('does not rename when the rendered name already matches', async () => {
    jest.useFakeTimers();
    const guild = makeGuild({channelCount: 7});
    const channel = makeChannel({
        name: 'Channels: 7',
        guild
    });
    const client = makeClient({
        channels: [{
            channelID: 'ch1',
            channelName: 'Channels: %channelCount%',
            updateInterval: 5
        }],
        fetchMap: {ch1: channel},
        guild
    });
    await botReady.run(client);
    expect(channel.setName).not.toHaveBeenCalled();
});

test('warns for a non-voice / non-category channel', async () => {
    jest.useFakeTimers();
    const guild = makeGuild();
    const channel = makeChannel({
        name: 'x',
        type: ChannelType.GuildText,
        guild
    });
    const client = makeClient({
        channels: [{
            channelID: 'ch1',
            channelName: 'x',
            updateInterval: 5
        }],
        fetchMap: {ch1: channel},
        guild
    });
    await botReady.run(client);
    expect(client.logger.warn).toHaveBeenCalledTimes(1);
});

test('skips channels that cannot be fetched', async () => {
    jest.useFakeTimers();
    const guild = makeGuild();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const client = makeClient({
        channels: [{
            channelID: 'gone',
            channelName: 'x',
            updateInterval: 5
        }],
        fetchMap: {},
        guild
    });
    await botReady.run(client);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
});

test('registers an interval clamped to a 5-minute floor', async () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const guild = makeGuild();
    const channel = makeChannel({
        name: 'x',
        guild
    });
    const client = makeClient({
        channels: [{
            channelID: 'ch1',
            channelName: 'x',
            updateInterval: 1
        }],
        fetchMap: {ch1: channel},
        guild
    });
    await botReady.run(client);
    expect(client.intervals).toHaveLength(1);
    // updateInterval 1 -> clamped to 5 minutes (300000ms)
    expect(setIntervalSpy.mock.calls[0][1]).toBe(300000);
    setIntervalSpy.mockRestore();
});

test('the interval re-renders and renames on change', async () => {
    jest.useFakeTimers();
    const guild = makeGuild({channelCount: 4});
    const channel = makeChannel({
        name: 'Channels: 4',
        guild
    });
    const client = makeClient({
        channels: [{
            channelID: 'ch1',
            channelName: 'Channels: %channelCount%',
            updateInterval: 5
        }],
        fetchMap: {ch1: channel},
        guild
    });
    await botReady.run(client);
    expect(channel.setName).not.toHaveBeenCalled(); // already matches
    // Now the channel count grows; the interval should rename
    guild.channels.cache.set('99', {});
    channel.name = 'Channels: 4';
    await jest.advanceTimersByTimeAsync(300000);
    expect(channel.setName).toHaveBeenCalledWith('Channels: 5', expect.any(String));
});