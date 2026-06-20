/*
 * Regression test: casting/removing a poll vote used to await poll.save() then
 * mockUpdateMessage() (a REST message edit) before replying, with no defer. Under load the
 * reply landed after Discord's 3s window. Both vote branches must now deferReply first.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));

const mockUpdateMessage = jest.fn().mockResolvedValue();
jest.mock('../../modules/polls/polls', () => ({updateMessage: (...args) => mockUpdateMessage(...args)}));

const handler = require('../../modules/polls/events/interactionCreate');

function makePoll() {
    return {
        votes: {'1': []},
        options: ['A', 'B'],
        description: 'desc',
        expiresAt: null,
        endAt: null,
        messageID: 'msg1',
        save: jest.fn().mockResolvedValue()
    };
}

function makeClient(poll) {
    return {models: {polls: {Poll: {findOne: jest.fn().mockResolvedValue(poll)}}}};
}

function baseInteraction() {
    return {
        isButton: () => false,
        isSelectMenu: () => false,
        user: {id: 'u1'},
        message: {
            id: 'msg1',
            channel: {id: 'c1'}
        },
        channel: {id: 'c1'},
        deferReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => mockUpdateMessage.mockClear());

test('polls-vote acknowledges before persisting and re-rendering the poll', async () => {
    const poll = makePoll();
    const interaction = baseInteraction(poll);
    interaction.isSelectMenu = () => true;
    interaction.customId = 'polls-vote';
    interaction.values = ['0'];

    await handler.run(makeClient(poll), interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    const deferOrder = interaction.deferReply.mock.invocationCallOrder[0];
    expect(poll.save.mock.invocationCallOrder[0]).toBeGreaterThan(deferOrder);
    expect(mockUpdateMessage.mock.invocationCallOrder[0]).toBeGreaterThan(deferOrder);
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
});

test('polls-rem-vot- acknowledges before persisting and re-rendering the poll', async () => {
    const poll = makePoll();
    const interaction = baseInteraction(poll);
    interaction.isButton = () => true;
    interaction.customId = 'polls-rem-vot-msg1';

    await handler.run(makeClient(poll), interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    const deferOrder = interaction.deferReply.mock.invocationCallOrder[0];
    expect(mockUpdateMessage.mock.invocationCallOrder[0]).toBeGreaterThan(deferOrder);
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
});