/*
 * The "View Moderation History" USER context command is a thin adapter: it reuses the exact
 * payload generateActionsResponse produces for /ping-protection user actions-history and replies
 * ephemerally, so the output is identical for the targeted user. These tests verify the delegation.
 */
const mockGenerateActionsResponse = jest.fn().mockResolvedValue({
    embeds: ['E'],
    components: ['C']
});

jest.mock('../../modules/ping-protection/core/panels', () => ({
    generateHistoryResponse: jest.fn(),
    generateActionsResponse: (...a) => mockGenerateActionsResponse(...a)
}));

const {MessageFlags} = require('discord.js');
const command = require('../../modules/ping-protection/commands/view-moderation-history');

beforeEach(() => mockGenerateActionsResponse.mockClear());

describe('View Moderation History context command', () => {
    test('config: USER context, staff-gated', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['MODERATE_MEMBERS']);
    });

    test('reuses generateActionsResponse for the target and replies ephemerally with its payload', async () => {
        const reply = jest.fn().mockResolvedValue('ok');
        const interaction = {
            client: {id: 'client'},
            targetUser: {id: 'victim'},
            reply
        };
        await command.run(interaction);
        expect(mockGenerateActionsResponse).toHaveBeenCalledWith(interaction.client, 'victim', 1);
        expect(reply).toHaveBeenCalledWith({
            embeds: ['E'],
            components: ['C'],
            flags: MessageFlags.Ephemeral
        });
    });
});