/*
 * Behavioural tests for the counter counting handler (events/messageCreate.js).
 *
 * Covers the count-sequence branches:
 *   - a correct next number increments currentNumber, records the counter, and
 *     adds the configured success reaction;
 *   - a wrong (non-sequential) number is rejected without advancing;
 *   - restartOnWrongCount resets the channel to 0 when someone posts a number
 *     that is not currentNumber;
 *   - onlyOneMessagePerUser rejects the same user counting twice in a row;
 *   - reaching a milestone message-count grants the milestone roles.
 *
 * The fparser-backed math path is left off (allowMaths:false) so the parser
 * stays a synchronous integer parse and no dynamic ESM import is hit.
 */

const handler = require('../../modules/counter/events/messageCreate');

function makeChannelDoc(overrides = {}) {
    return {
        channelID: 'count-chan',
        currentNumber: 5,
        lastCountedUser: 'someone-else',
        userCounts: {},
        save: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

function makeClient(channelDoc, {
    moduleConfig = {},
    milestones = []
} = {}) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        configurations: {
            counter: {
                config: {
                    channels: ['count-chan'],
                    onlyOneMessagePerUser: false,
                    restartOnWrongCount: false,
                    restartOnWrongCountMessage: 'restarted',
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
        models: {
            counter: {CountChannel: {findOne: jest.fn().mockResolvedValue(channelDoc)}}
        }
    };
}

function makeMessage(content, authorId = 'counter-1') {
    const replyMsg = {
        delete: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue({delete: jest.fn()})
    };
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
            id: 'count-chan',
            setTopic: jest.fn().mockResolvedValue(),
            permissionOverwrites: {create: jest.fn().mockResolvedValue()}
        },
        reply: jest.fn().mockResolvedValue(replyMsg),
        react: jest.fn().mockResolvedValue({remove: jest.fn()}),
        delete: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    jest.useFakeTimers();
});
afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});

describe('counter correct next number', () => {
    test('increments the count, records the user, and reacts with success', async () => {
        const doc = makeChannelDoc({currentNumber: 5});
        const msg = makeMessage('6');
        await handler.run(makeClient(doc), msg);

        expect(doc.currentNumber).toBe(6);
        expect(doc.lastCountedUser).toBe('counter-1');
        expect(doc.userCounts['counter-1']).toBe(1);
        expect(doc.save).toHaveBeenCalled();
        expect(msg.react).toHaveBeenCalledWith('✅');
    });
});

describe('counter wrong number', () => {
    test('a non-sequential number does not advance the count', async () => {
        const doc = makeChannelDoc({currentNumber: 5});
        const msg = makeMessage('9');
        await handler.run(makeClient(doc), msg);

        expect(doc.currentNumber).toBe(5);
        expect(doc.save).not.toHaveBeenCalled();
        expect(msg.react).not.toHaveBeenCalled();
    });

    test('non-numeric content is rejected as not-a-number', async () => {
        const doc = makeChannelDoc({currentNumber: 5});
        const msg = makeMessage('banana');
        await handler.run(makeClient(doc), msg);
        expect(doc.currentNumber).toBe(5);
        expect(msg.react).not.toHaveBeenCalled();
    });
});

describe('counter restartOnWrongCount', () => {
    test('resets the channel to zero on a wrong (non-next) number', async () => {
        const doc = makeChannelDoc({
            currentNumber: 5,
            lastCountedUser: 'x',
            userCounts: {x: 3}
        });
        const msg = makeMessage('100');
        await handler.run(makeClient(doc, {moduleConfig: {restartOnWrongCount: true}}), msg);

        expect(doc.currentNumber).toBe(0);
        expect(doc.lastCountedUser).toBeNull();
        expect(doc.userCounts).toEqual({});
        expect(doc.save).toHaveBeenCalled();
        expect(msg.reply).toHaveBeenCalled();
    });
});

describe('counter onlyOneMessagePerUser', () => {
    test('rejects the same user counting twice in a row', async () => {
        const doc = makeChannelDoc({
            currentNumber: 5,
            lastCountedUser: 'counter-1'
        });
        const msg = makeMessage('6', 'counter-1');
        await handler.run(makeClient(doc, {moduleConfig: {onlyOneMessagePerUser: true}}), msg);

        expect(doc.currentNumber).toBe(5);
        expect(doc.save).not.toHaveBeenCalled();
        expect(msg.react).not.toHaveBeenCalled();
    });

    test('allows a different user to count next even with the restriction on', async () => {
        const doc = makeChannelDoc({
            currentNumber: 5,
            lastCountedUser: 'someone-else'
        });
        const msg = makeMessage('6', 'counter-1');
        await handler.run(makeClient(doc, {moduleConfig: {onlyOneMessagePerUser: true}}), msg);

        expect(doc.currentNumber).toBe(6);
        expect(msg.react).toHaveBeenCalledWith('✅');
    });
});

describe('counter milestones', () => {
    test('grants the milestone roles when the user hits the configured message count', async () => {
        const doc = makeChannelDoc({
            currentNumber: 5,
            userCounts: {'counter-1': 2}
        });
        const msg = makeMessage('6', 'counter-1');
        const milestones = [{
            userMessageCount: '3',
            giveRoles: ['role-vip'],
            sendMessage: null
        }];
        await handler.run(makeClient(doc, {milestones}), msg);

        // userCounts goes 2 -> 3, matching the milestone threshold.
        expect(doc.userCounts['counter-1']).toBe(3);
        expect(msg.member.roles.add).toHaveBeenCalledWith(['role-vip']);
    });

    test('does not grant roles when the count has not reached the threshold', async () => {
        const doc = makeChannelDoc({
            currentNumber: 5,
            userCounts: {'counter-1': 0}
        });
        const msg = makeMessage('6', 'counter-1');
        const milestones = [{
            userMessageCount: '10',
            giveRoles: ['role-vip'],
            sendMessage: null
        }];
        await handler.run(makeClient(doc, {milestones}), msg);

        expect(msg.member.roles.add).not.toHaveBeenCalled();
    });
});