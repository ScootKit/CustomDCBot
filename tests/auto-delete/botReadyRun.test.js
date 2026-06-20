/*
 * Covers the startup sweep in modules/auto-delete/events/botReady.js run():
 *  - computes uniqueChannels excluding any channel also configured as a voice
 *    channel
 *  - bulk-deletes text-channel history beyond keepMessageCount, never touching
 *    pinned / non-deletable / kept messages
 *  - keepMessageCount=0 deletes everything (minus pinned/non-deletable)
 *  - empty channels are skipped
 *  - unfetchable channels log an error and abort
 *  - voice channels are bulk-cleared only when empty
 * localize/main auto-stubbed.
 */
const {Collection} = require('discord.js');
const botReady = require('../../modules/auto-delete/events/botReady');

function msg({
                 id,
                 pinned = false,
                 deletable = true,
                 createdAt = new Date()
             } = {}) {
    return {
        id,
        pinned,
        deletable,
        createdAt
    };
}

function makeTextChannel(messages, {name = 'general'} = {}) {
    const coll = new Collection();
    messages.forEach(m => coll.set(m.id, m));
    return {
        name,
        messages: {fetch: jest.fn().mockResolvedValue(coll)},
        bulkDelete: jest.fn().mockResolvedValue()
    };
}

function makeClient({
                        channels = [],
                        voiceChannels = [],
                        fetchMap = {}
                    } = {}) {
    return {
        configurations: {
            'auto-delete': {
                channels,
                'voice-channels': voiceChannels
            }
        },
        modules: {'auto-delete': {}},
        channels: {fetch: jest.fn().mockImplementation((id) => Promise.resolve(fetchMap[id] ?? null))},
        logger: {error: jest.fn()}
    };
}

test('keepMessageCount=2 keeps the 2 newest and bulk-deletes the rest', async () => {
    const newest = msg({
        id: '3',
        createdAt: new Date(3000)
    });
    const mid = msg({
        id: '2',
        createdAt: new Date(2000)
    });
    const oldest = msg({
        id: '1',
        createdAt: new Date(1000)
    });
    const channel = makeTextChannel([newest, mid, oldest]);
    const client = makeClient({
        channels: [{
            channelID: 'c1',
            keepMessageCount: '2'
        }],
        fetchMap: {c1: channel}
    });
    await botReady.run(client);
    expect(channel.bulkDelete).toHaveBeenCalledTimes(1);
    const deleted = channel.bulkDelete.mock.calls[0][0];
    // Only the oldest message remains for deletion
    expect([...deleted.values()].map(m => m.id)).toEqual(['1']);
});

test('keepMessageCount=0 deletes all non-pinned deletable messages', async () => {
    const a = msg({id: '1'});
    const pinned = msg({
        id: '2',
        pinned: true
    });
    const undeletable = msg({
        id: '3',
        deletable: false
    });
    const channel = makeTextChannel([a, pinned, undeletable]);
    const client = makeClient({
        channels: [{
            channelID: 'c1',
            keepMessageCount: '0'
        }],
        fetchMap: {c1: channel}
    });
    await botReady.run(client);
    const deleted = channel.bulkDelete.mock.calls[0][0];
    expect([...deleted.values()].map(m => m.id)).toEqual(['1']);
});

test('excludes channels that are also configured as voice channels', async () => {
    const textChannel = makeTextChannel([msg({id: '1'})]);
    const voiceChannel = {
        members: {size: 1},
        messages: {fetch: jest.fn()},
        bulkDelete: jest.fn()
    };
    const client = makeClient({
        channels: [{
            channelID: 'shared',
            keepMessageCount: '0'
        }],
        voiceChannels: [{channelID: 'shared'}],
        fetchMap: {shared: voiceChannel}
    });
    await botReady.run(client);
    // shared is filtered out of uniqueChannels, so no text bulk-delete on it
    expect(client.modules['auto-delete'].uniqueChannels).toEqual([]);
});

test('skips empty channels', async () => {
    const channel = makeTextChannel([]);
    const client = makeClient({
        channels: [{
            channelID: 'c1',
            keepMessageCount: '0'
        }],
        fetchMap: {c1: channel}
    });
    await botReady.run(client);
    expect(channel.bulkDelete).not.toHaveBeenCalled();
});

test('logs an error and aborts when a configured channel cannot be fetched', async () => {
    const client = makeClient({
        channels: [{
            channelID: 'missing',
            keepMessageCount: '0'
        }],
        fetchMap: {}
    });
    await botReady.run(client);
    expect(client.logger.error).toHaveBeenCalledTimes(1);
});

test('bulk-clears an empty voice channel and skips occupied ones', async () => {
    const emptyVoice = {
        members: {size: 0},
        messages: {fetch: jest.fn().mockResolvedValue(new Collection([['1', msg({id: '1'})]]))},
        bulkDelete: jest.fn().mockResolvedValue()
    };
    const client = makeClient({
        voiceChannels: [{channelID: 'v1'}],
        fetchMap: {v1: emptyVoice}
    });
    await botReady.run(client);
    expect(emptyVoice.bulkDelete).toHaveBeenCalledTimes(1);
});

test('does not clear a voice channel that still has members', async () => {
    const busyVoice = {
        members: {size: 3},
        messages: {fetch: jest.fn()},
        bulkDelete: jest.fn()
    };
    const client = makeClient({
        voiceChannels: [{channelID: 'v1'}],
        fetchMap: {v1: busyVoice}
    });
    await botReady.run(client);
    expect(busyVoice.bulkDelete).not.toHaveBeenCalled();
});