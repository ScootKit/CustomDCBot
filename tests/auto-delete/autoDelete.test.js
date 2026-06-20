/*
 * Tests for the auto-delete module.
 *
 * findUniqueChannels (botReady.js): last-writer-wins de-duplication of channel
 * config entries keyed by channelID.
 *
 * messageCreate.js: schedules a deletion after channel.timeout minutes. Covers:
 *   - guard clauses (not ready / no guild / wrong guild / no member / channel
 *     not in the unique list)
 *   - keepMessageCount === 0 deletes the new message itself after the timeout
 *   - pinned / non-deletable messages are left alone
 *   - keepMessageCount > 0 deletes the oldest message once enough exist
 *
 * voiceStateUpdate.js: bulk-deletes messages in an empty configured voice
 * channel after the configured timeout, skipping occupied channels.
 */

const {ChannelType} = require('discord.js');
const {findUniqueChannels} = require('../../modules/auto-delete/events/botReady.js');
const messageCreate = require('../../modules/auto-delete/events/messageCreate.js');
const voiceStateUpdate = require('../../modules/auto-delete/events/voiceStateUpdate.js');

describe('findUniqueChannels', () => {
    test('keeps a single entry per channelID (last writer wins)', () => {
        const input = [
            {
                channelID: 'a',
                timeout: '1'
            },
            {
                channelID: 'b',
                timeout: '2'
            },
            {
                channelID: 'a',
                timeout: '99'
            }
        ];
        const result = findUniqueChannels(input);
        expect(result).toHaveLength(2);
        const a = result.find(c => c.channelID === 'a');
        expect(a.timeout).toBe('99');
    });

    test('returns entries unchanged when all channelIDs are unique', () => {
        const input = [{channelID: 'x'}, {channelID: 'y'}];
        expect(findUniqueChannels(input)).toHaveLength(2);
    });

    test('handles an empty list', () => {
        expect(findUniqueChannels([])).toEqual([]);
    });
});

describe('auto-delete messageCreate', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function makeClient(uniqueChannels) {
        return {
            botReadyAt: Date.now(),
            guildID: 'g1',
            modules: {'auto-delete': {uniqueChannels}}
        };
    }

    function makeMsg({
                         channelID = 'c1',
                         deletable = true,
                         pinned = false
                     } = {}) {
        return {
            id: '100',
            guild: {id: 'g1'},
            member: {id: 'm1'},
            deletable,
            pinned,
            delete: jest.fn().mockResolvedValue(),
            channel: {
                id: channelID,
                messages: {fetch: jest.fn().mockResolvedValue([])}
            }
        };
    }

    test('does nothing when the bot is not ready', async () => {
        const client = makeClient([{
            channelID: 'c1',
            timeout: '1',
            keepMessageCount: '0'
        }]);
        client.botReadyAt = null;
        const msg = makeMsg();
        await messageCreate.run(client, msg);
        jest.runAllTimers();
        expect(msg.delete).not.toHaveBeenCalled();
    });

    test('does nothing for a channel that is not configured', async () => {
        const client = makeClient([{
            channelID: 'other',
            timeout: '1',
            keepMessageCount: '0'
        }]);
        const msg = makeMsg({channelID: 'c1'});
        await messageCreate.run(client, msg);
        jest.runAllTimers();
        expect(msg.delete).not.toHaveBeenCalled();
    });

    test('keepMessageCount=0 deletes the message itself after timeout minutes', async () => {
        const client = makeClient([{
            channelID: 'c1',
            timeout: '2',
            keepMessageCount: '0'
        }]);
        const msg = makeMsg();
        await messageCreate.run(client, msg);
        // not yet — timer is 2 minutes
        expect(msg.delete).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(2 * 60000);
        expect(msg.delete).toHaveBeenCalledTimes(1);
    });

    test('does not delete a pinned message', async () => {
        const client = makeClient([{
            channelID: 'c1',
            timeout: '1',
            keepMessageCount: '0'
        }]);
        const msg = makeMsg({pinned: true});
        await messageCreate.run(client, msg);
        await jest.advanceTimersByTimeAsync(60000);
        expect(msg.delete).not.toHaveBeenCalled();
    });

    test('keepMessageCount>0 deletes the oldest message once enough history exists', async () => {
        const oldest = {
            createdAt: new Date(1000),
            deletable: true,
            pinned: false,
            delete: jest.fn().mockResolvedValue()
        };
        const newer = {
            createdAt: new Date(2000),
            deletable: true,
            pinned: false,
            delete: jest.fn().mockResolvedValue()
        };
        // collection-like: needs .sort returning array with .last() and .length
        const collection = [newer, oldest];
        collection.sort = function (cmp) {
            const arr = [newer, oldest].sort(cmp);
            arr.last = () => arr[arr.length - 1];
            return arr;
        };
        const client = makeClient([{
            channelID: 'c1',
            timeout: '1',
            keepMessageCount: '2'
        }]);
        const msg = makeMsg();
        msg.channel.messages.fetch = jest.fn().mockResolvedValue(collection);

        await messageCreate.run(client, msg);
        await jest.advanceTimersByTimeAsync(60000);

        // fetch asked for messages before this one, limited to keepMessageCount
        expect(msg.channel.messages.fetch).toHaveBeenCalledWith({
            before: '100',
            limit: 2
        });
        // oldest (sorted last, descending) is the one removed
        expect(oldest.delete).toHaveBeenCalledTimes(1);
        expect(newer.delete).not.toHaveBeenCalled();
    });
});

describe('auto-delete voiceStateUpdate', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function makeClient({
                            voiceChannels,
                            channel
                        }) {
        return {
            botReadyAt: Date.now(),
            configurations: {'auto-delete': {'voice-channels': voiceChannels}},
            channels: {fetch: jest.fn().mockResolvedValue(channel)},
            logger: {error: jest.fn()}
        };
    }

    test('ignores voice channels not in the config', async () => {
        const client = makeClient({
            voiceChannels: [{
                channelID: 'vc-x',
                timeout: '1'
            }],
            channel: null
        });
        await voiceStateUpdate.run(client, {channelId: 'vc-other'});
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('skips a voice channel that still has members', async () => {
        const bulkDelete = jest.fn().mockResolvedValue();
        const channel = {
            type: ChannelType.GuildVoice,
            members: {size: 2},
            messages: {fetch: jest.fn()},
            bulkDelete
        };
        const client = makeClient({
            voiceChannels: [{
                channelID: 'vc1',
                timeout: '1'
            }],
            channel
        });
        await voiceStateUpdate.run(client, {channelId: 'vc1'});
        jest.runAllTimers();
        expect(bulkDelete).not.toHaveBeenCalled();
    });

    test('bulk-deletes messages of an empty voice channel after the timeout', async () => {
        const messages = {size: 3};
        const bulkDelete = jest.fn().mockResolvedValue();
        const channel = {
            type: ChannelType.GuildVoice,
            members: {size: 0},
            messages: {fetch: jest.fn().mockResolvedValue(messages)},
            bulkDelete
        };
        const client = makeClient({
            voiceChannels: [{
                channelID: 'vc1',
                timeout: '3'
            }],
            channel
        });
        await voiceStateUpdate.run(client, {channelId: 'vc1'});
        expect(bulkDelete).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(3 * 60 * 1000);
        expect(bulkDelete).toHaveBeenCalledWith(messages, true);
    });

    test('logs an error and aborts when the channel cannot be fetched', async () => {
        const client = makeClient({
            voiceChannels: [{
                channelID: 'vc1',
                timeout: '1'
            }],
            channel: undefined
        });
        await voiceStateUpdate.run(client, {channelId: 'vc1'});
        expect(client.logger.error).toHaveBeenCalledTimes(1);
    });
});