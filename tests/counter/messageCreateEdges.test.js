/*
 * Additional edge-case tests for the counter messageCreate handler not covered
 * by messageCreate.test.js:
 *   - easter-egg reactions for special numbers (and the default success reaction
 *     when easter eggs are off / a non-special number is reached)
 *   - milestone sendMessage replies (auto-deleted)
 *   - channelDescription topic updates with the %x% placeholder
 *   - the early-return guards (no member, no guild, wrong guild, not ready)
 */
jest.mock('../../src/functions/helpers', () => ({embedType: (x) => ({content: x})}));

const handler = require('../../modules/counter/events/messageCreate');

function makeChannelDoc(overrides = {}) {
    return {
        channelID: 'c1',
        currentNumber: 5,
        lastCountedUser: 'other',
        userCounts: {},
        save: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

function makeClient(doc, {
    moduleConfig = {},
    milestones = []
} = {}) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        configurations: {
            counter: {
                config: {
                    channels: ['c1'],
                    onlyOneMessagePerUser: false,
                    restartOnWrongCount: false,
                    'success-reaction': '✅',
                    'wrong-input-message': 'wrong',
                    enableEasterEggs: false,
                    removeReactions: false,
                    channelDescription: '',
                    strikeAmount: '0',
                    allowCharactersInMessage: false,
                    allowMaths: false,
                    ...moduleConfig
                },
                milestones
            }
        },
        models: {counter: {CountChannel: {findOne: jest.fn().mockResolvedValue(doc)}}}
    };
}

function makeMsg(content, authorId = 'u1') {
    return {
        content,
        guild: {id: 'g1'},
        author: {
            id: authorId,
            bot: false,
            toString: () => `<@${authorId}>`
        },
        member: {roles: {add: jest.fn().mockResolvedValue()}},
        channel: {
            id: 'c1',
            setTopic: jest.fn().mockResolvedValue()
        },
        reply: jest.fn().mockResolvedValue({delete: jest.fn()}),
        react: jest.fn().mockResolvedValue({remove: jest.fn()})
    };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});

describe('easter eggs', () => {
    test('reacts with the 💯 egg when reaching 100', async () => {
        const doc = makeChannelDoc({currentNumber: 99});
        const msg = makeMsg('100');
        await handler.run(makeClient(doc, {moduleConfig: {enableEasterEggs: true}}), msg);
        expect(msg.react).toHaveBeenCalledWith('💯');
    });

    test('reacts with two emergency eggs for 112', async () => {
        const doc = makeChannelDoc({currentNumber: 111});
        const msg = makeMsg('112');
        await handler.run(makeClient(doc, {moduleConfig: {enableEasterEggs: true}}), msg);
        expect(msg.react).toHaveBeenCalledWith('🚑');
        expect(msg.react).toHaveBeenCalledWith('🚒');
    });

    test('falls back to the success reaction for a non-special number', async () => {
        const doc = makeChannelDoc({currentNumber: 7});
        const msg = makeMsg('8');
        await handler.run(makeClient(doc, {moduleConfig: {enableEasterEggs: true}}), msg);
        expect(msg.react).toHaveBeenCalledWith('✅');
    });
});

describe('milestone messages', () => {
    test('sends and auto-deletes a milestone message', async () => {
        const doc = makeChannelDoc({
            currentNumber: 5,
            userCounts: {u1: 2}
        });
        const msg = makeMsg('6', 'u1');
        const milestones = [{
            userMessageCount: '3',
            giveRoles: [],
            sendMessage: 'MILESTONE'
        }];
        await handler.run(makeClient(doc, {milestones}), msg);
        expect(msg.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'MILESTONE'}));
    });
});

describe('channel description topic', () => {
    test('updates the topic substituting %x% with the next number', async () => {
        const doc = makeChannelDoc({currentNumber: 5});
        const msg = makeMsg('6');
        await handler.run(makeClient(doc, {moduleConfig: {channelDescription: 'Next: %x%'}}), msg);
        // currentNumber becomes 6, so the topic shows currentNumber+1 = 7
        expect(msg.channel.setTopic).toHaveBeenCalledWith('Next: 7', expect.any(String));
    });
});

describe('removeReactions', () => {
    test('schedules removal of the success reaction', async () => {
        const removeSpy = jest.fn();
        const doc = makeChannelDoc({currentNumber: 5});
        const msg = makeMsg('6');
        msg.react = jest.fn().mockResolvedValue({remove: removeSpy});
        await handler.run(makeClient(doc, {moduleConfig: {removeReactions: true}}), msg);
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
        expect(removeSpy).toHaveBeenCalled();
    });
});

describe('early-return guards', () => {
    test('ignores a message without a member', async () => {
        const doc = makeChannelDoc();
        const client = makeClient(doc);
        const msg = makeMsg('6');
        msg.member = null;
        await handler.run(client, msg);
        expect(client.models.counter.CountChannel.findOne).not.toHaveBeenCalled();
    });

    test('ignores messages from the wrong guild', async () => {
        const doc = makeChannelDoc();
        const client = makeClient(doc);
        const msg = makeMsg('6');
        msg.guild = {id: 'other'};
        await handler.run(client, msg);
        expect(client.models.counter.CountChannel.findOne).not.toHaveBeenCalled();
    });

    test('ignores messages before the bot is ready', async () => {
        const doc = makeChannelDoc();
        const client = makeClient(doc);
        client.botReadyAt = null;
        const msg = makeMsg('6');
        await handler.run(client, msg);
        expect(client.models.counter.CountChannel.findOne).not.toHaveBeenCalled();
    });

    test('ignores a channel that is not configured', async () => {
        const doc = makeChannelDoc();
        const client = makeClient(doc);
        const msg = makeMsg('6');
        msg.channel.id = 'not-configured';
        await handler.run(client, msg);
        expect(client.models.counter.CountChannel.findOne).not.toHaveBeenCalled();
    });
});