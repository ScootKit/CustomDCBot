/*
 * Branch-coverage tests for the polls interactionCreate handler beyond the
 * existing defer regression test. Covers:
 *  - early returns (no poll, no message + non-remove customId)
 *  - polls-own-vote: not voted / voted (with remove button only when not expired)
 *  - polls-public-votes: rejects private polls, lists voters for public ones
 *  - polls-vote multi-select: clears prior votes then records all selected
 *  - polls-rem-vot-: removes the user from every option bucket
 *  - expired guard blocks new votes
 *
 * polls.updateMessage is mocked; we assert directly on the mutated poll.votes
 * and on the reply/editReply payloads.
 */
jest.mock('../../modules/polls/polls', () => ({updateMessage: jest.fn().mockResolvedValue()}));

const handler = require('../../modules/polls/events/interactionCreate');
const {updateMessage} = require('../../modules/polls/polls');

function makePoll(overrides = {}) {
    return {
        votes: {
            '1': [],
            '2': [],
            '3': []
        },
        options: ['A', 'B', 'C'],
        description: 'desc',
        expiresAt: null,
        endAt: null,
        messageID: 'msg1',
        channelID: 'c1',
        save: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

function makeClient(poll) {
    return {
        models: {polls: {Poll: {findOne: jest.fn().mockResolvedValue(poll)}}},
        configurations: {polls: {config: {reactions: [null, '1️⃣', '2️⃣', '3️⃣']}}}
    };
}

function baseInteraction(overrides = {}) {
    return {
        isButton: () => false,
        isSelectMenu: () => false,
        user: {id: 'u1'},
        message: {
            id: 'msg1',
            channel: {id: 'c1'}
        },
        channel: {id: 'c1'},
        client: null,
        deferReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

beforeEach(() => updateMessage.mockClear());

describe('early returns', () => {
    test('returns when there is no message and customId is not a remove-vote', async () => {
        const client = makeClient(makePoll());
        const interaction = baseInteraction({
            message: null,
            customId: 'something-else',
            isButton: () => true
        });
        await handler.run(client, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(client.models.polls.Poll.findOne).not.toHaveBeenCalled();
    });

    test('returns silently when the poll does not exist', async () => {
        const client = makeClient(null);
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'polls-own-vote'
        });
        await handler.run(client, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });
});

describe('polls-own-vote', () => {
    test('tells a non-voter they have not voted', async () => {
        const client = makeClient(makePoll());
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'polls-own-vote'
        });
        await handler.run(client, interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('polls.not-voted-yet');
    });

    test('lists the voted option and offers a remove button when open', async () => {
        const poll = makePoll({
            votes: {
                '1': ['u1'],
                '2': [],
                '3': []
            }
        });
        const client = makeClient(poll);
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'polls-own-vote'
        });
        await handler.run(client, interaction);
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.content).toContain('polls.you-voted');
        expect(payload.content).toContain('polls.change-opinion');
        const buttons = payload.components[0].components;
        expect(buttons[0].customId).toBe('polls-rem-vot-msg1');
    });

    test('omits the remove button when the poll already expired', async () => {
        const poll = makePoll({
            votes: {
                '1': ['u1'],
                '2': [],
                '3': []
            },
            expiresAt: new Date(Date.now() - 1000)
        });
        const client = makeClient(poll);
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'polls-own-vote'
        });
        await handler.run(client, interaction);
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.content).not.toContain('polls.change-opinion');
        expect(payload.components[0].components).toEqual([]);
    });
});

describe('polls-public-votes', () => {
    test('rejects when the poll is not public', async () => {
        const client = makeClient(makePoll());
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'polls-public-votes',
            client
        });
        interaction.client = client;
        await handler.run(client, interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('polls.not-public');
    });

    test('lists voters per option for a public poll', async () => {
        const poll = makePoll({
            description: '[PUBLIC]desc',
            votes: {
                '1': ['a', 'b'],
                '2': [],
                '3': []
            }
        });
        const client = makeClient(poll);
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'polls-public-votes'
        });
        interaction.client = client;
        await handler.run(client, interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const fields = embed.data.fields;
        expect(fields[0].value).toContain('<@a>');
        expect(fields[0].value).toContain('<@b>');
        // empty option falls back to "no votes" localized string
        expect(fields[1].value).toContain('polls.no-votes-for-this-option');
    });
});

describe('polls-vote (select menu)', () => {
    test('records multiple selected options after clearing prior votes', async () => {
        const poll = makePoll({
            votes: {
                '1': ['u1'],
                '2': [],
                '3': []
            }
        });
        const client = makeClient(poll);
        const interaction = baseInteraction({
            isSelectMenu: () => true,
            customId: 'polls-vote',
            values: ['1', '2']
        });
        await handler.run(client, interaction);
        // old vote in bucket 1 cleared, new votes for options 1->bucket2 and 2->bucket3
        expect(poll.votes['1']).not.toContain('u1');
        expect(poll.votes['2']).toContain('u1');
        expect(poll.votes['3']).toContain('u1');
        expect(poll.save).toHaveBeenCalled();
        expect(updateMessage).toHaveBeenCalledWith(interaction.message.channel, poll, 'msg1');
        expect(interaction.editReply.mock.calls[0][0].content).toBe('polls.voted-successfully');
    });

    test('does not double-add when re-voting the same option', async () => {
        const poll = makePoll({
            votes: {
                '1': [],
                '2': ['u1'],
                '3': []
            }
        });
        const client = makeClient(poll);
        const interaction = baseInteraction({
            isSelectMenu: () => true,
            customId: 'polls-vote',
            values: ['1']
        });
        await handler.run(client, interaction);
        expect(poll.votes['2'].filter(v => v === 'u1')).toHaveLength(1);
    });

    test('does not record a vote on an expired poll', async () => {
        const poll = makePoll({expiresAt: new Date(Date.now() - 1000)});
        const client = makeClient(poll);
        const interaction = baseInteraction({
            isSelectMenu: () => true,
            customId: 'polls-vote',
            values: ['0']
        });
        await handler.run(client, interaction);
        expect(poll.save).not.toHaveBeenCalled();
        expect(updateMessage).not.toHaveBeenCalled();
    });
});

describe('polls-rem-vot-', () => {
    test('removes the user from every bucket and re-renders', async () => {
        const poll = makePoll({
            votes: {
                '1': ['u1', 'x'],
                '2': ['u1'],
                '3': []
            }
        });
        const client = makeClient(poll);
        const interaction = baseInteraction({
            message: null,
            isButton: () => true,
            customId: 'polls-rem-vot-msg1'
        });
        await handler.run(client, interaction);
        expect(poll.votes['1']).toEqual(['x']);
        expect(poll.votes['2']).toEqual([]);
        expect(poll.save).toHaveBeenCalled();
        expect(updateMessage).toHaveBeenCalledWith(interaction.channel, poll, 'msg1');
        expect(interaction.editReply.mock.calls[0][0].content).toContain('polls.removed-vote');
    });

    test('looks the poll up by the id embedded in the customId', async () => {
        const poll = makePoll();
        const client = makeClient(poll);
        const interaction = baseInteraction({
            message: null,
            isButton: () => true,
            customId: 'polls-rem-vot-abc'
        });
        await handler.run(client, interaction);
        expect(client.models.polls.Poll.findOne).toHaveBeenCalledWith({where: {messageID: 'abc'}});
    });
});