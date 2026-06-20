/*
 * Tests for the two suggestion entry points the existing suite did not cover:
 *
 *   - commands/suggestion.js run(): defers ephemerally, delegates to
 *     createSuggestion and echoes the configured success template with the new id
 *   - events/messageCreate.js run(): the guard chain (bot author, no guild, wrong
 *     guild, feature off, wrong channel) and the "channel suggestion" happy path
 *     that deletes the source message and creates a suggestion from its content
 *
 * The createSuggestion sibling and embedType helper are mocked.
 */

jest.mock('../../modules/suggestions/suggestion', () => ({
    createSuggestion: jest.fn().mockResolvedValue({id: 123})
}));
jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((tpl, params) => ({
        tpl,
        params
    }))
}));

const {createSuggestion} = require('../../modules/suggestions/suggestion');
const helpers = require('../../src/functions/helpers');
const command = require('../../modules/suggestions/commands/suggestion');
const event = require('../../modules/suggestions/events/messageCreate');

beforeEach(() => {
    createSuggestion.mockClear();
    helpers.embedType.mockClear();
});

describe('/suggestion command', () => {
    test('defers ephemerally, creates the suggestion and confirms with its id', async () => {
        const interaction = {
            guild: {id: 'g1'},
            user: {id: 'u1'},
            options: {getString: jest.fn(() => 'add dark mode')},
            client: {configurations: {suggestions: {config: {successfullySubmitted: 'SUBMITTED'}}}},
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue()
        };
        await command.run(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(createSuggestion).toHaveBeenCalledWith(interaction.guild, 'add dark mode', interaction.user);
        expect(helpers.embedType).toHaveBeenCalledWith('SUBMITTED', {'%id%': 123});
        expect(interaction.editReply).toHaveBeenCalled();
    });
});

describe('suggestions messageCreate', () => {
    function makeClient(overrides = {}) {
        return {
            config: {guildID: 'g1'},
            configurations: {
                suggestions: {
                    config: {
                        createSuggestionFromMessagesInChannel: true,
                        suggestionChannel: 'sugg-chan',
                        ...overrides
                    }
                }
            }
        };
    }

    function makeMsg(overrides = {}) {
        return {
            author: {
                bot: false,
                id: 'u1'
            },
            guild: {id: 'g1'},
            channel: {id: 'sugg-chan'},
            cleanContent: 'please add X',
            delete: jest.fn().mockResolvedValue(),
            ...overrides
        };
    }

    test('ignores bot authors', async () => {
        const client = makeClient();
        const msg = makeMsg({
            author: {
                bot: true,
                id: 'b'
            }
        });
        await event.run(client, msg);
        expect(msg.delete).not.toHaveBeenCalled();
        expect(createSuggestion).not.toHaveBeenCalled();
    });

    test('ignores messages outside the configured guild', async () => {
        const client = makeClient();
        const msg = makeMsg({guild: {id: 'other'}});
        await event.run(client, msg);
        expect(createSuggestion).not.toHaveBeenCalled();
    });

    test('ignores messages with no guild (DMs)', async () => {
        const client = makeClient();
        const msg = makeMsg({guild: null});
        await event.run(client, msg);
        expect(createSuggestion).not.toHaveBeenCalled();
    });

    test('does nothing when channel-suggestions are disabled', async () => {
        const client = makeClient({createSuggestionFromMessagesInChannel: false});
        const msg = makeMsg();
        await event.run(client, msg);
        expect(msg.delete).not.toHaveBeenCalled();
        expect(createSuggestion).not.toHaveBeenCalled();
    });

    test('ignores messages in a non-suggestion channel', async () => {
        const client = makeClient();
        const msg = makeMsg({channel: {id: 'random'}});
        await event.run(client, msg);
        expect(createSuggestion).not.toHaveBeenCalled();
    });

    test('deletes the source message and creates a suggestion from its content', async () => {
        const client = makeClient();
        const msg = makeMsg();
        await event.run(client, msg);
        expect(msg.delete).toHaveBeenCalled();
        expect(createSuggestion).toHaveBeenCalledWith(msg.guild, 'please add X', msg.author);
    });
});