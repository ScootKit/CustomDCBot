/*
 * Edge coverage for modules/auto-publisher/events/messageCreate.js beyond the
 * main happy/mode tests:
 *  - missing whitelist array in whitelist mode -> defaults to [] -> skip
 *  - missing blacklist array in blacklist mode -> defaults to [] -> publish
 *  - wrong-guild and no-guild guards
 *  - the success reaction is scheduled for removal after 2.5s
 */
const {ChannelType} = require('discord.js');
const handler = require('../../modules/auto-publisher/events/messageCreate');

function makeMsg({
                     config = {},
                     guildId = 'g1',
                     hasGuild = true,
                     channelType = ChannelType.GuildAnnouncement
                 } = {}) {
    const reaction = {remove: jest.fn()};
    return {
        _reaction: reaction,
        guild: hasGuild ? {id: guildId} : null,
        author: {bot: false},
        content: 'hello',
        crosspostable: true,
        channel: {
            id: 'announce1',
            type: channelType
        },
        crosspost: jest.fn().mockResolvedValue(),
        react: jest.fn().mockResolvedValue(reaction),
        client: {
            botReadyAt: Date.now(),
            guildID: 'g1',
            config: {prefix: '!'},
            configurations: {'auto-publisher': {config}}
        }
    };
}

test('whitelist mode with no whitelist array skips publishing', async () => {
    const msg = makeMsg({config: {mode: 'whitelist'}}); // whitelist undefined
    await handler.run(msg.client, msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
});

test('blacklist mode with no blacklist array still publishes', async () => {
    const msg = makeMsg({config: {mode: 'blacklist'}}); // blacklist undefined
    await handler.run(msg.client, msg);
    expect(msg.crosspost).toHaveBeenCalled();
});

test('ignores messages without a guild', async () => {
    const msg = makeMsg({hasGuild: false});
    await handler.run(msg.client, msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
});

test('ignores messages from another guild', async () => {
    const msg = makeMsg({guildId: 'other'});
    await handler.run(msg.client, msg);
    expect(msg.crosspost).not.toHaveBeenCalled();
});

test('defaults mode to "all" when unset, publishing everywhere', async () => {
    const config = {};
    const msg = makeMsg({config});
    await handler.run(msg.client, msg);
    expect(config.mode).toBe('all');
    expect(msg.crosspost).toHaveBeenCalled();
});

test('removes the success reaction after 2.5 seconds', async () => {
    jest.useFakeTimers();
    try {
        const msg = makeMsg({config: {}});
        await handler.run(msg.client, msg);
        expect(msg._reaction.remove).not.toHaveBeenCalled();
        jest.advanceTimersByTime(2500);
        expect(msg._reaction.remove).toHaveBeenCalledTimes(1);
    } finally {
        jest.useRealTimers();
    }
});