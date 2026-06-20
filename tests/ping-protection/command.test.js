/*
 * Tests for the /ping-protection command.
 *
 * run() routes to subcommands[group][sub] when a group is present, else to
 * subcommands[sub]. The user.* subcommands build a payload via the matching
 * generate* helper and reply ephemerally. listHandler renders the protected /
 * whitelisted config as an embed, using the "none" fallback for empty lists.
 */
const mockHistory = jest.fn().mockResolvedValue({
    embeds: ['h'],
    components: []
});
const mockActions = jest.fn().mockResolvedValue({
    embeds: ['a'],
    components: []
});
const mockPanel = jest.fn().mockResolvedValue({
    embeds: ['p'],
    components: []
});
jest.mock('../../modules/ping-protection/ping-protection', () => ({
    generateHistoryResponse: (...a) => mockHistory(...a),
    generateActionsResponse: (...a) => mockActions(...a),
    generateUserPanel: (...a) => mockPanel(...a)
}));

const command = require('../../modules/ping-protection/commands/ping-protection');

function makeInteraction({
                             group = null,
                             sub,
                             user,
                             config
                         } = {}) {
    return {
        options: {
            getSubcommandGroup: jest.fn(() => group),
            getSubcommand: jest.fn(() => sub),
            getUser: jest.fn(() => user)
        },
        client: {
            strings: {
                disableFooterTimestamp: true,
                footer: 'f',
                footerImgUrl: ''
            },
            configurations: {'ping-protection': {configuration: config}}
        },
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    mockHistory.mockClear();
    mockActions.mockClear();
    mockPanel.mockClear();
});

describe('routing', () => {
    test('routes user.history to generateHistoryResponse', async () => {
        const interaction = makeInteraction({
            group: 'user',
            sub: 'history',
            user: {id: 'u1'}
        });
        await command.run(interaction);
        expect(mockHistory).toHaveBeenCalledWith(interaction.client, 'u1', 1);
        expect(interaction.reply).toHaveBeenCalled();
    });

    test('routes user.actions-history to generateActionsResponse', async () => {
        const interaction = makeInteraction({
            group: 'user',
            sub: 'actions-history',
            user: {id: 'u1'}
        });
        await command.run(interaction);
        expect(mockActions).toHaveBeenCalledWith(interaction.client, 'u1', 1);
    });

    test('routes user.panel to generateUserPanel', async () => {
        const user = {id: 'u1'};
        const interaction = makeInteraction({
            group: 'user',
            sub: 'panel',
            user
        });
        await command.run(interaction);
        expect(mockPanel).toHaveBeenCalledWith(interaction.client, user);
    });
});

describe('list subcommands', () => {
    test('protected list renders users and roles', async () => {
        const interaction = makeInteraction({
            group: 'list',
            sub: 'protected',
            config: {
                protectedUsers: ['u1'],
                protectedRoles: ['r1']
            }
        });
        await command.run(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const usersField = embed.fields.find(f => f.name.includes('field-protected-users'));
        expect(usersField.value).toContain('<@u1>');
        const rolesField = embed.fields.find(f => f.name.includes('field-protected-roles'));
        expect(rolesField.value).toContain('<@&r1>');
    });

    test('protected list shows the "none" fallback for empty lists', async () => {
        const interaction = makeInteraction({
            group: 'list',
            sub: 'protected',
            config: {
                protectedUsers: [],
                protectedRoles: []
            }
        });
        await command.run(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        expect(embed.fields[0].value).toContain('ping-protection.list-none');
    });

    test('whitelisted list renders roles, channels and users', async () => {
        const interaction = makeInteraction({
            group: 'list',
            sub: 'whitelisted',
            config: {
                ignoredRoles: ['r1'],
                ignoredChannels: ['c1'],
                ignoredUsers: ['u1']
            }
        });
        await command.run(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const values = embed.fields.map(f => f.value).join('|');
        expect(values).toContain('<@&r1>');
        expect(values).toContain('<#c1>');
        expect(values).toContain('<@u1>');
    });
});