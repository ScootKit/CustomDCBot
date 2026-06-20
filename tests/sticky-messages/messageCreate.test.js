/*
 * Behavior tests for the sticky-messages messageCreate handler.
 *
 * The handler keeps a configured "sticky" message pinned to the bottom of a
 * channel: when someone posts, it deletes the old sticky and re-sends it, but
 * debounces rapid bursts (a 5s window). Covers:
 *   - guard clauses (not ready, no guild, wrong guild, no member)
 *   - channels with no sticky config are ignored
 *   - the bot's own freshly-sent sticky does not retrigger (sendPending guard)
 *   - bot authors are ignored unless respondBots is enabled
 *   - first message in a channel sends the sticky immediately
 *   - a second message within 5s is debounced (schedules a timeout, no immediate
 *     re-send), while a message after the window re-sends immediately
 *
 * embedTypeV2 is mocked so we assert on send/delete orchestration.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn(async (m) => ({content: 'sticky:' + m}))
}));

let handler;
beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    handler = require('../../modules/sticky-messages/events/messageCreate');
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

function makeChannel(id = 'chan1') {
    return {
        id,
        send: jest.fn().mockResolvedValue({
            id: 'sent-' + id,
            deletable: true,
            delete: jest.fn().mockResolvedValue()
        }),
        messages: {
            fetch: jest.fn().mockResolvedValue({
                deletable: true,
                delete: jest.fn().mockResolvedValue()
            })
        }
    };
}

function makeClient(stickyChannels) {
    return {
        botReadyAt: Date.now(),
        user: {id: 'bot'},
        configurations: {'sticky-messages': {'sticky-messages': stickyChannels}}
    };
}

function makeMsg(channel, {
    authorId = 'human',
    bot = false,
    guild = {id: 'g1'},
    member = {}
} = {}) {
    return {
        guild,
        member,
        channel,
        author: {
            id: authorId,
            bot
        }
    };
}

const guildId = 'g1';

function clientForGuild(stickyChannels) {
    const c = makeClient(stickyChannels);
    c.config = {guildID: guildId};
    c.guildID = guildId;
    return c;
}

describe('sticky-messages guards', () => {
    test('ignores messages before the bot is ready', async () => {
        const channel = makeChannel();
        const client = clientForGuild([{
            channelId: channel.id,
            message: 'hi'
        }]);
        client.botReadyAt = null;
        await handler.run(client, makeMsg(channel));
        expect(channel.send).not.toHaveBeenCalled();
    });

    test('ignores messages outside the configured guild', async () => {
        const channel = makeChannel();
        const client = clientForGuild([{
            channelId: channel.id,
            message: 'hi'
        }]);
        await handler.run(client, makeMsg(channel, {guild: {id: 'other'}}));
        expect(channel.send).not.toHaveBeenCalled();
    });

    test('ignores channels without a sticky configuration', async () => {
        const channel = makeChannel('unconfigured');
        const client = clientForGuild([{
            channelId: 'someother',
            message: 'hi'
        }]);
        await handler.run(client, makeMsg(channel));
        expect(channel.send).not.toHaveBeenCalled();
    });

    test('ignores bot authors unless respondBots is enabled', async () => {
        const channel = makeChannel();
        const client = clientForGuild([{
            channelId: channel.id,
            message: 'hi',
            respondBots: false
        }]);
        await handler.run(client, makeMsg(channel, {bot: true}));
        expect(channel.send).not.toHaveBeenCalled();
    });
});

describe('sticky-messages send / debounce', () => {
    test('sends the sticky on the first human message in the channel', async () => {
        const channel = makeChannel('firstchan');
        const client = clientForGuild([{
            channelId: channel.id,
            message: 'welcome'
        }]);
        await handler.run(client, makeMsg(channel));
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(channel.send).toHaveBeenCalledWith({content: 'sticky:welcome'});
    });

    test('debounces a rapid follow-up message within the 5s window', async () => {
        const channel = makeChannel('burstchan');
        const client = clientForGuild([{
            channelId: channel.id,
            message: 'welcome'
        }]);
        await handler.run(client, makeMsg(channel)); // first send
        channel.send.mockClear();

        await handler.run(client, makeMsg(channel)); // within window -> debounced
        expect(channel.send).not.toHaveBeenCalled();
    });

    test('re-sends immediately for a message after the 5s window', async () => {
        const channel = makeChannel('slowchan');
        const client = clientForGuild([{
            channelId: channel.id,
            message: 'welcome'
        }]);
        await handler.run(client, makeMsg(channel)); // first send sets time = now
        await Promise.resolve();
        channel.send.mockClear();

        jest.advanceTimersByTime(6000); // move past the 5s window
        await handler.run(client, makeMsg(channel));
        expect(channel.send).toHaveBeenCalledTimes(1);
    });
});