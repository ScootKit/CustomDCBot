/*
 * Tests for the auto-publisher messageCreate handler
 * (modules/auto-publisher/events/messageCreate.js).
 *
 * Covers the publish gating: only crossposts in announcement channels, honors
 * ignoreBots, prefix-command skip, and the blacklist / whitelist / all modes.
 * Also verifies the success path reacts with a checkmark and that crosspost is
 * skipped for non-crosspostable messages.
 */

const {ChannelType} = require('discord.js');
const handler = require('../../modules/auto-publisher/events/messageCreate.js');

function makeMsg({
                     config = {},
                     channelType = ChannelType.GuildAnnouncement,
                     channelId = 'announce1',
                     authorBot = false,
                     content = 'hello',
                     crosspostable = true
                 } = {}) {
    return {
        guild: {id: 'g1'},
        author: {bot: authorBot},
        content,
        crosspostable,
        channel: {
            id: channelId,
            type: channelType
        },
        crosspost: jest.fn().mockResolvedValue(),
        react: jest.fn().mockResolvedValue({remove: jest.fn()}),
        client: {
            botReadyAt: Date.now(),
            guildID: 'g1',
            config: {prefix: '!'},
            configurations: {'auto-publisher': {config}}
        }
    };
}

function clientOf(msg) {
    return msg.client;
}

test('crossposts and reacts in an announcement channel (default "all" mode)', async () => {
    const msg = makeMsg({config: {}});
    await handler.run(clientOf(msg), msg);
    expect(msg.crosspost).toHaveBeenCalledTimes(1);
    expect(msg.react).toHaveBeenCalledWith('✅');
});

test('does nothing in a non-announcement channel', async () => {
    const msg = makeMsg({channelType: ChannelType.GuildText});
    await handler.run(clientOf(msg), msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
    expect(msg.react).not.toHaveBeenCalled();
});

test('skips prefixed command messages', async () => {
    const msg = makeMsg({content: '!ping'});
    await handler.run(clientOf(msg), msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
});

test('skips bot messages when ignoreBots is set', async () => {
    const msg = makeMsg({
        config: {ignoreBots: true},
        authorBot: true
    });
    await handler.run(clientOf(msg), msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
});

test('publishes bot messages when ignoreBots is not set', async () => {
    const msg = makeMsg({
        config: {ignoreBots: false},
        authorBot: true
    });
    await handler.run(clientOf(msg), msg);
    expect(msg.crosspost).toHaveBeenCalled();
});

describe('blacklist mode', () => {
    test('skips a blacklisted channel', async () => {
        const msg = makeMsg({
            config: {
                mode: 'blacklist',
                blacklist: ['announce1']
            }
        });
        await handler.run(clientOf(msg), msg);
        expect(msg.crosspost).not.toHaveBeenCalled();
    });

    test('publishes a non-blacklisted channel', async () => {
        const msg = makeMsg({
            config: {
                mode: 'blacklist',
                blacklist: ['other']
            }
        });
        await handler.run(clientOf(msg), msg);
        expect(msg.crosspost).toHaveBeenCalled();
    });
});

describe('whitelist mode', () => {
    test('publishes a whitelisted channel', async () => {
        const msg = makeMsg({
            config: {
                mode: 'whitelist',
                whitelist: ['announce1']
            }
        });
        await handler.run(clientOf(msg), msg);
        expect(msg.crosspost).toHaveBeenCalled();
    });

    test('skips a non-whitelisted channel', async () => {
        const msg = makeMsg({
            config: {
                mode: 'whitelist',
                whitelist: ['other']
            }
        });
        await handler.run(clientOf(msg), msg);
        expect(msg.crosspost).not.toHaveBeenCalled();
        // It still reacts only on the publish path, so no reaction either.
        expect(msg.react).not.toHaveBeenCalled();
    });
});

test('reacts even when the message is not crosspostable', async () => {
    const msg = makeMsg({crosspostable: false});
    await handler.run(clientOf(msg), msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
    expect(msg.react).toHaveBeenCalledWith('✅');
});

test('ignores messages before the bot is ready', async () => {
    const msg = makeMsg();
    msg.client.botReadyAt = null;
    await handler.run(clientOf(msg), msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
});