/*
 * Direct tests for the sticky-messages helper functions (deleteMessage /
 * sendMessage) plus the debounce-timer-fires path, complementing
 * messageCreate.test.js (which drives them through run()).
 *
 *   - sendMessage(): renders via embedTypeV2 and posts to the channel, recording
 *     the sent message id in the per-channel state
 *   - deleteMessage(): no-ops for an unknown channel; deletes the tracked message
 *     when found; falls back to scanning recent messages for one authored by the
 *     bot when the tracked fetch fails
 *   - the debounced run(): after the 5s window elapses, the scheduled timeout
 *     deletes the previous sticky and re-sends it
 *
 * embedTypeV2 is mocked; timers are faked.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn(async (m) => ({content: 'sticky:' + m}))
}));

let handler;
let helpers;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    // re-grab the fresh helpers mock instance the handler will use
    helpers = require('../../src/functions/helpers');
    helpers.embedTypeV2.mockClear();
    handler = require('../../modules/sticky-messages/events/messageCreate');
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('sendMessage', () => {
    test('renders and posts the configured sticky', async () => {
        const sent = {id: 'sent-1'};
        const channel = {
            id: 'c1',
            send: jest.fn().mockResolvedValue(sent)
        };
        await handler.sendMessage(channel, 'welcome');
        expect(helpers.embedTypeV2).toHaveBeenCalledWith('welcome');
        expect(channel.send).toHaveBeenCalledWith({content: 'sticky:welcome'});
    });
});

describe('deleteMessage', () => {
    test('no-ops for a channel with no tracked sticky', async () => {
        const channel = {
            id: 'never-used',
            messages: {fetch: jest.fn()}
        };
        await handler.deleteMessage('bot', channel);
        expect(channel.messages.fetch).not.toHaveBeenCalled();
    });

    test('deletes the tracked sticky message', async () => {
        const stickyMsg = {
            deletable: true,
            delete: jest.fn().mockResolvedValue()
        };
        const channel = {
            id: 'c-del',
            send: jest.fn().mockResolvedValue({id: 'sent-x'}),
            messages: {fetch: jest.fn().mockResolvedValue(stickyMsg)}
        };
        // establish tracked state for this channel
        await handler.sendMessage(channel, 'hi');
        await handler.deleteMessage('bot', channel);
        expect(stickyMsg.delete).toHaveBeenCalled();
    });

    test('falls back to scanning recent messages when the tracked fetch fails', async () => {
        const botMsg = {
            author: {id: 'bot'},
            delete: jest.fn().mockResolvedValue()
        };
        const recent = {find: (fn) => ([botMsg].find(fn))};
        const channel = {
            id: 'c-fallback',
            send: jest.fn().mockResolvedValue({id: 'sent-y'}),
            messages: {
                fetch: jest.fn((arg) => {
                    // the limit:20 scan resolves; the tracked-id fetch rejects so
                    // the handler falls back to scanning recent messages
                    if (arg && arg.limit) return Promise.resolve(recent);
                    return Promise.reject(new Error('gone'));
                })
            }
        };
        await handler.sendMessage(channel, 'hi');
        await handler.deleteMessage('bot', channel);
        expect(botMsg.delete).toHaveBeenCalled();
    });
});

describe('debounced timeout fires a refresh', () => {
    test('after the window, the scheduled timeout deletes and re-sends', async () => {
        const stickyMsg = {
            deletable: true,
            delete: jest.fn().mockResolvedValue()
        };
        const channel = {
            id: 'burst',
            send: jest.fn().mockResolvedValue({
                id: 'sent-z',
                deletable: true,
                delete: jest.fn()
            }),
            messages: {fetch: jest.fn().mockResolvedValue(stickyMsg)}
        };
        const client = {
            botReadyAt: Date.now(),
            user: {id: 'bot'},
            guildID: 'g1',
            configurations: {
                'sticky-messages': {
                    'sticky-messages': [{
                        channelId: 'burst',
                        message: 'welcome'
                    }]
                }
            }
        };
        const msg = {
            guild: {id: 'g1'},
            member: {},
            channel,
            author: {
                id: 'human',
                bot: false
            }
        };

        await handler.run(client, msg); // first send -> sets time = now
        channel.send.mockClear();
        await handler.run(client, msg); // within window -> schedules a 5s timeout

        jest.advanceTimersByTime(5000); // fire the debounce timeout
        await Promise.resolve();
        await Promise.resolve();
        expect(channel.send).toHaveBeenCalled(); // re-sent after the timeout
    });
});