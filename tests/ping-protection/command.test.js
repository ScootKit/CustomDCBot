/*
 * Tests for the /ping-protection command.
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
const mockToggle = jest.fn();
const mockIsToggledOff = jest.fn().mockResolvedValue(false);

jest.mock('../../modules/ping-protection/core/panels', () => ({
    generateHistoryResponse: (...a) => mockHistory(...a),
    generateActionsResponse: (...a) => mockActions(...a),
    generateUserPanel: (...a) => mockPanel(...a)
}));
jest.mock('../../modules/ping-protection/core/toggle', () => ({
    toggleUserProtection: (...a) => mockToggle(...a),
    isProtectionToggledOff: (...a) => mockIsToggledOff(...a)
}));

const command = require('../../modules/ping-protection/commands/ping-protection');

function makeInteraction({
    group = null,
    sub,
    user,
    config = {},
    permissions = ['Administrator']
} = {}) {
    return {
        options: {
            getSubcommandGroup: jest.fn(() => group),
            getSubcommand: jest.fn(() => sub),
            getUser: jest.fn(() => user)
        },
        member: {
            id: 'm1',
            permissions: {
                has: jest.fn((perm) => permissions.includes(perm))
            }
        },
        user: {id: 'm1'},
        client: {
            strings: {
                disableFooterTimestamp: true,
                footer: 'f',
                footerImgUrl: ''
            },
            configurations: {
                'ping-protection': {
                    configuration: config
                }
            }
        },
        reply: jest.fn().mockResolvedValue()
    };
}

async function runCommand(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group) {
        return command.subcommands[group][sub](interaction);
    }
    return command.subcommands[sub](interaction);
}

beforeEach(() => {
    mockHistory.mockClear();
    mockActions.mockClear();
    mockPanel.mockClear();
    mockToggle.mockClear();
    mockIsToggledOff.mockClear();
    mockIsToggledOff.mockResolvedValue(false);
});

describe('user subcommands', () => {
    test('routes user.history to generateHistoryResponse', async () => {
        const interaction = makeInteraction({
            group: 'user',
            sub: 'history',
            user: {id: 'u1'}
        });
        await runCommand(interaction);
        expect(mockHistory).toHaveBeenCalledWith(interaction.client, 'u1', 1);
        expect(interaction.reply).toHaveBeenCalled();
    });

    test('routes user.actions-history to generateActionsResponse', async () => {
        const interaction = makeInteraction({
            group: 'user',
            sub: 'actions-history',
            user: {id: 'u1'}
        });
        await runCommand(interaction);
        expect(mockActions).toHaveBeenCalledWith(interaction.client, 'u1', 1);
    });

    test('routes user.panel to generateUserPanel for managers', async () => {
        const user = {id: 'u1'};
        const interaction = makeInteraction({
            group: 'user',
            sub: 'panel',
            user,
            permissions: ['ManageGuild']
        });
        await runCommand(interaction);
        expect(mockPanel).toHaveBeenCalledWith(interaction.client, user);
    });

    test('blocks user.panel for users without ManageGuild or Admin', async () => {
        const interaction = makeInteraction({
            group: 'user',
            sub: 'panel',
            user: {id: 'u1'},
            permissions: []
        });
        await runCommand(interaction);
        expect(mockPanel).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('no-permission');
    });
});

describe('toggle subcommand', () => {
    test('blocks toggle if disabled in admin config', async () => {
        const interaction = makeInteraction({
            sub: 'toggle',
            config: {allowProtectionToggle: false}
        });
        await runCommand(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('toggle-disabled-by-admin');
        expect(mockToggle).not.toHaveBeenCalled();
    });

    test('handles successful pause toggle', async () => {
        mockToggle.mockResolvedValue({
            success: true,
            state: 'disabled',
            disabledUntil: new Date(Date.now() + 86400000)
        });
        const interaction = makeInteraction({
            sub: 'toggle',
            config: {allowProtectionToggle: true}
        });
        await runCommand(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('toggle-succ-disabled');
    });
});

describe('list subcommands', () => {
    test('protected list renders paused indicator if user toggled off', async () => {
        mockIsToggledOff.mockResolvedValue(true);
        const interaction = makeInteraction({
            group: 'list',
            sub: 'protected',
            config: {
                allowProtectionToggle: true,
                protectedUsers: ['u1'],
                protectedRoles: []
            }
        });
        await runCommand(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const usersField = embed.fields.find(f => f.name.includes('field-protected-users'));
        expect(usersField.value).toContain('list-user-paused');
    });

    test('protected list shows the none fallback for empty lists', async () => {
        const interaction = makeInteraction({
            group: 'list',
            sub: 'protected',
            config: {
                protectedUsers: [],
                protectedRoles: []
            }
        });
        await runCommand(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        expect(embed.fields[0].value).toContain('list-none');
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
        await runCommand(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const values = embed.fields.map(f => f.value).join('|');
        expect(values).toContain('<@&r1>');
        expect(values).toContain('<#c1>');
        expect(values).toContain('<@u1>');
    });
});