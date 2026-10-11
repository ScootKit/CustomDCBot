/*
 * The "View Ping History" USER context command is a thin adapter: it reuses the exact payload
 * generateHistoryResponse produces for /ping-protection user history and replies ephemerally,
 * so the output is identical for the targeted user. These tests verify the delegation.
 */
const mockGenerateHistoryResponse = jest.fn().mockResolvedValue({
    embeds: ['E'],
    components: ['C']
});

jest.mock('../../modules/ping-protection/core/panels', () => ({
    generateHistoryResponse: (...a) => mockGenerateHistoryResponse(...a),
    generateActionsResponse: jest.fn()
}));

const {MessageFlags} = require('discord.js');
const command = require('../../modules/ping-protection/commands/view-ping-history');

beforeEach(() => mockGenerateHistoryResponse.mockClear());

describe('View Ping History context command', () => {
    test('config: USER context, staff-gated', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['MODERATE_MEMBERS']);
    });

    test('reuses generateHistoryResponse for the target and replies ephemerally with its payload', async () => {
        const reply = jest.fn().mockResolvedValue('ok');
        const interaction = {
            client: {id: 'client'},
            targetUser: {id: 'victim'},
            reply
        };
        await command.run(interaction);
        expect(mockGenerateHistoryResponse).toHaveBeenCalledWith(interaction.client, 'victim', 1);
        expect(reply).toHaveBeenCalledWith({
            embeds: ['E'],
            components: ['C'],
            flags: MessageFlags.Ephemeral
        });
    });
});