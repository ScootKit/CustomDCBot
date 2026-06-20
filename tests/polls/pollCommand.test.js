/*
 * Tests for the /poll command (commands/poll.js).
 *
 * create subcommand:
 *  - rejects a non-text channel before deferring
 *  - collects option1..option10, clamps max-selections, prepends [PUBLIC],
 *    parses duration into endAt, then calls createPoll and confirms
 * end subcommand:
 *  - "not found" reply when no poll matches
 *  - sets expiresAt, saves, re-renders, and confirms
 * autocomplete (end.msg-id):
 *  - returns only open polls matching the typed value, capped at 25
 *
 * createPoll/updateMessage and parseDuration are mocked.
 */
const {ChannelType} = require('discord.js');

const mockCreatePoll = jest.fn().mockResolvedValue();
const mockUpdateMessage = jest.fn().mockResolvedValue();
jest.mock('../../modules/polls/polls', () => ({
    createPoll: (...a) => mockCreatePoll(...a),
    updateMessage: (...a) => mockUpdateMessage(...a)
}));
jest.mock('../../src/functions/parseDuration', () => jest.fn(() => 60000));

const command = require('../../modules/polls/commands/poll');

function makeOptions(map) {
    return {
        getChannel: jest.fn((name) => map.channels?.[name]),
        getString: jest.fn((name) => (name in (map.strings || {}) ? map.strings[name] : null)),
        getBoolean: jest.fn((name) => map.booleans?.[name] ?? null),
        getInteger: jest.fn((name) => (name in (map.integers || {}) ? map.integers[name] : null))
    };
}

beforeEach(() => {
    mockCreatePoll.mockClear();
    mockUpdateMessage.mockClear();
});

describe('create subcommand', () => {
    test('rejects a non-text channel before deferring', async () => {
        const interaction = {
            options: makeOptions({channels: {channel: {type: ChannelType.GuildVoice}}}),
            reply: jest.fn().mockResolvedValue(),
            deferReply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.create(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('polls.not-text-channel');
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(mockCreatePoll).not.toHaveBeenCalled();
    });

    test('builds a public poll, clamps max-selections to option count, and confirms', async () => {
        const channel = {
            type: ChannelType.GuildText,
            toString: () => '#polls'
        };
        const interaction = {
            client: {},
            options: makeOptions({
                channels: {channel},
                strings: {
                    description: 'Question?',
                    option1: 'A',
                    option2: 'B',
                    duration: '1m'
                },
                booleans: {public: true},
                integers: {'max-selections': 9} // > 2 options -> clamp to 2
            }),
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.create(interaction);
        const data = mockCreatePoll.mock.calls[0][0];
        expect(data.description).toBe('[PUBLIC]Question?');
        expect(data.options).toEqual(['A', 'B']);
        expect(data.maxSelections).toBe(2);
        expect(data.endAt).toBeInstanceOf(Date);
        expect(interaction.editReply.mock.calls[0][0].content).toContain('polls.created-poll');
    });

    test('defaults max-selections to 1 when omitted and leaves description non-public', async () => {
        const channel = {
            type: ChannelType.GuildText,
            toString: () => '#polls'
        };
        const interaction = {
            client: {},
            options: makeOptions({
                channels: {channel},
                strings: {
                    description: 'Q',
                    option1: 'A',
                    option2: 'B'
                },
                booleans: {public: false},
                integers: {}
            }),
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.create(interaction);
        const data = mockCreatePoll.mock.calls[0][0];
        expect(data.description).toBe('Q');
        expect(data.maxSelections).toBe(1);
        expect(data.endAt).toBeUndefined();
    });
});

describe('end subcommand', () => {
    test('replies not-found when no poll matches the id', async () => {
        const interaction = {
            client: {models: {polls: {Poll: {findOne: jest.fn().mockResolvedValue(null)}}}},
            options: makeOptions({strings: {'msg-id': 'nope'}}),
            reply: jest.fn().mockResolvedValue(),
            deferReply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.end(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('polls.not-found');
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    test('expires the poll, saves, re-renders and confirms', async () => {
        const poll = {
            channelID: 'c1',
            save: jest.fn().mockResolvedValue()
        };
        const channel = {id: 'c1'};
        const interaction = {
            client: {models: {polls: {Poll: {findOne: jest.fn().mockResolvedValue(poll)}}}},
            guild: {channels: {cache: {get: jest.fn(() => channel)}}},
            options: makeOptions({strings: {'msg-id': 'm1'}}),
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.end(interaction);
        expect(poll.expiresAt).toBeInstanceOf(Date);
        expect(poll.save).toHaveBeenCalled();
        expect(mockUpdateMessage).toHaveBeenCalledWith(channel, poll, 'm1');
        expect(interaction.editReply.mock.calls[0][0].content).toContain('polls.ended-poll');
    });
});

describe('end autocomplete', () => {
    const autoComplete = command.autoComplete.end['msg-id'];

    test('lists only open polls matching the typed value', async () => {
        const future = new Date(Date.now() + 100000);
        const past = new Date(Date.now() - 100000);
        const allPolls = [
            {
                messageID: 'a1',
                description: 'Apple poll',
                expiresAt: future,
                channelID: 'c'
            },
            {
                messageID: 'b2',
                description: 'Banana poll',
                expiresAt: past,
                channelID: 'c'
            },
            {
                messageID: 'c3',
                description: 'Apricot',
                expiresAt: null,
                channelID: 'c'
            }
        ];
        const respond = jest.fn();
        const interaction = {
            value: 'AP',
            client: {
                models: {polls: {Poll: {findAll: jest.fn().mockResolvedValue(allPolls)}}},
                guild: {channels: {cache: {get: jest.fn(() => ({name: 'general'}))}}}
            },
            respond
        };
        await autoComplete(interaction);
        const result = respond.mock.calls[0][0];
        const ids = result.map(r => r.value);
        // a1 (open, "Apple") and c3 (no expiry, "Apricot"); b2 is expired -> excluded
        expect(ids).toContain('a1');
        expect(ids).toContain('c3');
        expect(ids).not.toContain('b2');
    });

    test('caps the suggestions at 25', async () => {
        const future = new Date(Date.now() + 100000);
        const many = Array.from({length: 40}, (_, i) => ({
            messageID: `m${i}`,
            description: `match ${i}`,
            expiresAt: future,
            channelID: 'c'
        }));
        const respond = jest.fn();
        const interaction = {
            value: 'match',
            client: {
                models: {polls: {Poll: {findAll: jest.fn().mockResolvedValue(many)}}},
                guild: {channels: {cache: {get: jest.fn(() => ({name: 'g'}))}}}
            },
            respond
        };
        await autoComplete(interaction);
        expect(respond.mock.calls[0][0]).toHaveLength(25);
    });
});