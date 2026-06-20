/*
 * Additional edge coverage for modules/auto-thread/events/messageCreate.js:
 * every threadArchiveDuration keyword maps to the right discord.js enum, an
 * unknown keyword yields undefined autoArchiveDuration (passed through to
 * startThread), an empty-string channels config does not crash, and a message
 * in a configured channel that also has no thread still starts one with the
 * configured reason.
 */
const {ThreadAutoArchiveDuration} = require('discord.js');
const handler = require('../../modules/auto-thread/events/messageCreate');

function makeClient(over = {}) {
    return {
        botReadyAt: Date.now(),
        configurations: {
            'auto-thread': {
                config: {
                    channels: ['chan-1'],
                    threadName: 'Topic',
                    threadArchiveDuration: '1440',
                    ...over
                }
            }
        }
    };
}

function makeMessage(over = {}) {
    return {
        interaction: null,
        system: false,
        channel: {id: 'chan-1'},
        hasThread: false,
        startThread: jest.fn().mockResolvedValue({}),
        ...over
    };
}

const cases = [
    ['60', ThreadAutoArchiveDuration.OneHour],
    ['1440', ThreadAutoArchiveDuration.OneDay],
    ['4320', ThreadAutoArchiveDuration.ThreeDays],
    ['10080', ThreadAutoArchiveDuration.OneWeek],
    ['MAX', ThreadAutoArchiveDuration.OneWeek]
];

test.each(cases)('maps duration keyword %s to its enum value', async (keyword, expected) => {
    const msg = makeMessage();
    await handler.run(makeClient({threadArchiveDuration: keyword}), msg);
    expect(msg.startThread.mock.calls[0][0].autoArchiveDuration).toBe(expected);
});

test('an unknown duration keyword passes undefined to startThread', async () => {
    const msg = makeMessage();
    await handler.run(makeClient({threadArchiveDuration: 'bogus'}), msg);
    expect(msg.startThread.mock.calls[0][0].autoArchiveDuration).toBeUndefined();
});

test('passes a reason string to startThread', async () => {
    const msg = makeMessage();
    await handler.run(makeClient(), msg);
    expect(typeof msg.startThread.mock.calls[0][0].reason).toBe('string');
});

test('an empty channels array never starts a thread', async () => {
    const msg = makeMessage();
    await handler.run(makeClient({channels: []}), msg);
    expect(msg.startThread).not.toHaveBeenCalled();
});