/*
 * Behavior tests for the manage-suggestion command
 * (commands/manage-suggestion.js).
 *
 * Covers:
 *   - beforeSubcommand(): looks the suggestion up by id; if missing it replies
 *     with an error and flags returnEarly; otherwise it defers
 *   - run(): writes the adminAnswer (action/reason/userID), saves, regenerates
 *     the embed and notifies members; and is a no-op when returnEarly is set
 *   - autoCompleteSuggestionID(): filters un-answered suggestions by id /
 *     content / suggester and caps the result list at 25 entries
 *
 * The sibling suggestion module (generateSuggestionEmbed/notifyMembers) and
 * helpers are mocked so we test the command's own orchestration.
 */

jest.mock('../../modules/suggestions/suggestion', () => ({
    generateSuggestionEmbed: jest.fn().mockResolvedValue(),
    notifyMembers: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/functions/helpers', () => ({
    truncate: (s) => s,
    formatDiscordUserName: (u) => (u && u.tag) || 'unknown'
}));

const {
    generateSuggestionEmbed,
    notifyMembers
} = require('../../modules/suggestions/suggestion');
const cmd = require('../../modules/suggestions/commands/manage-suggestion');

function makeInteraction(overrides = {}) {
    return {
        options: {getString: jest.fn((k) => overrides.opts?.[k])},
        client: {
            models: {
                suggestions: {
                    Suggestion: {
                        findOne: jest.fn(),
                        findAll: jest.fn()
                    }
                }
            },
            guild: {members: {cache: {get: () => null}}}
        },
        user: {id: 'admin1'},
        reply: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        respond: jest.fn(),
        ...overrides
    };
}

beforeEach(() => {
    generateSuggestionEmbed.mockClear();
    notifyMembers.mockClear();
});

describe('beforeSubcommand', () => {
    test('replies with an error and flags returnEarly when the suggestion is missing', async () => {
        const interaction = makeInteraction({opts: {id: '999'}});
        interaction.client.models.suggestions.Suggestion.findOne = jest.fn().mockResolvedValue(null);
        await cmd.beforeSubcommand(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('suggestions.suggestion-not-found')
        }));
        expect(interaction.returnEarly).toBe(true);
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    test('defers and stores the suggestion when found', async () => {
        const suggestion = {id: 5};
        const interaction = makeInteraction({opts: {id: '5'}});
        interaction.client.models.suggestions.Suggestion.findOne = jest.fn().mockResolvedValue(suggestion);
        await cmd.beforeSubcommand(interaction);
        expect(interaction.suggestion).toBe(suggestion);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(interaction.reply).not.toHaveBeenCalled();
    });
});

describe('run', () => {
    test('is a no-op when returnEarly is set', async () => {
        const interaction = makeInteraction();
        interaction.returnEarly = true;
        await cmd.run(interaction);
        expect(generateSuggestionEmbed).not.toHaveBeenCalled();
        expect(interaction.editReply).not.toHaveBeenCalled();
    });

    test('writes the adminAnswer, saves, regenerates the embed and notifies', async () => {
        const save = jest.fn().mockResolvedValue();
        const interaction = makeInteraction({opts: {comment: 'looks good'}});
        interaction.editType = 'approve';
        interaction.suggestion = {save};
        await cmd.run(interaction);
        expect(interaction.suggestion.adminAnswer).toEqual({
            action: 'approve',
            reason: 'looks good',
            userID: 'admin1'
        });
        expect(save).toHaveBeenCalled();
        expect(generateSuggestionEmbed).toHaveBeenCalledWith(interaction.client, interaction.suggestion);
        expect(notifyMembers).toHaveBeenCalledWith(interaction.client, interaction.suggestion, 'team', 'admin1');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('suggestions.updated-suggestion')
        }));
    });
});

describe('autoCompleteSuggestionID', () => {
    function suggestionRow(id, text) {
        return {
            id,
            suggestion: text,
            messageID: 'msg-' + id,
            suggesterID: 'u' + id
        };
    }

    test('filters by suggestion content (case-insensitive)', async () => {
        const interaction = makeInteraction();
        interaction.value = 'DARK';
        interaction.client.models.suggestions.Suggestion.findAll = jest.fn().mockResolvedValue([
            suggestionRow(1, 'add dark mode'),
            suggestionRow(2, 'unrelated feature')
        ]);
        await cmd.autoCompleteSuggestionID(interaction);
        expect(interaction.respond).toHaveBeenCalledTimes(1);
        const choices = interaction.respond.mock.calls[0][0];
        expect(choices).toHaveLength(1);
        expect(choices[0].value).toBe('1');
    });

    test('matches by numeric id', async () => {
        const interaction = makeInteraction();
        interaction.value = '42';
        interaction.client.models.suggestions.Suggestion.findAll = jest.fn().mockResolvedValue([
            suggestionRow(42, 'something'),
            suggestionRow(7, 'else')
        ]);
        await cmd.autoCompleteSuggestionID(interaction);
        const choices = interaction.respond.mock.calls[0][0];
        expect(choices.map(c => c.value)).toEqual(['42']);
    });

    test('caps results at 25 entries', async () => {
        const interaction = makeInteraction();
        interaction.value = '';
        const rows = Array.from({length: 40}, (_, i) => suggestionRow(i + 1, 'idea ' + i));
        interaction.client.models.suggestions.Suggestion.findAll = jest.fn().mockResolvedValue(rows);
        await cmd.autoCompleteSuggestionID(interaction);
        expect(interaction.respond.mock.calls[0][0]).toHaveLength(25);
    });
});