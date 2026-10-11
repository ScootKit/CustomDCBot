/*
 * Tests for ping-protection's interactionCreate panel handler.
 */
const mockG = {
    generateHistoryResponse: jest.fn().mockResolvedValue({embeds: ['h']}),
    generateActionsResponse: jest.fn().mockResolvedValue({embeds: ['a']}),
    generateUserPanel: jest.fn().mockResolvedValue({embeds: ['panel']}),
    generatePanelDeletion: jest.fn().mockResolvedValue({embeds: ['pd']}),
    executeDataDeletion: jest.fn().mockResolvedValue(),
    getDeletionCooldown: jest.fn().mockResolvedValue(null),
    setDeletionCooldown: jest.fn().mockResolvedValue(new Date(Date.now() + 1000)),
    getDeletionTypeLocaleKey: jest.fn(() => 'del-type-pings'),
    parseTimeframeToMs: jest.fn((str) => (str ? 86400000 : null))
};

jest.mock('../../modules/ping-protection/core/localHelpers', () => ({
    getDeletionTypeLocaleKey: (...a) => mockG.getDeletionTypeLocaleKey(...a),
    parseTimeframeToMs: (...a) => mockG.parseTimeframeToMs(...a)
}));
jest.mock('../../modules/ping-protection/core/records', () => ({
    executeDataDeletion: (...a) => mockG.executeDataDeletion(...a),
    getDeletionCooldown: (...a) => mockG.getDeletionCooldown(...a),
    setDeletionCooldown: (...a) => mockG.setDeletionCooldown(...a)
}));
jest.mock('../../modules/ping-protection/core/panels', () => ({
    generateUserPanel: (...a) => mockG.generateUserPanel(...a),
    generatePanelDeletion: (...a) => mockG.generatePanelDeletion(...a),
    generateHistoryResponse: (...a) => mockG.generateHistoryResponse(...a),
    generateActionsResponse: (...a) => mockG.generateActionsResponse(...a)
}));

const handler = require('../../modules/ping-protection/events/interactionCreate');
const {localize} = require('../../src/functions/localize');

function makeClient({
    user = {
        id: 'target',
        username: 'T',
        tag: 'T#1'
    }
} = {}) {
    return {
        botReadyAt: Date.now(),
        strings: {
            disableFooterTimestamp: true,
            footer: 'f',
            footerImgUrl: ''
        },
        logger: {info: jest.fn()},
        users: {fetch: jest.fn().mockResolvedValue(user)}
    };
}

function baseInteraction(over = {}) {
    return {
        member: {permissions: {has: () => true}},
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        isButton: () => false,
        reply: jest.fn().mockResolvedValue(),
        update: jest.fn().mockResolvedValue(),
        showModal: jest.fn().mockResolvedValue(),
        ...over
    };
}

beforeEach(() => {
    Object.values(mockG).forEach(fn => fn.mockClear && fn.mockClear());
    mockG.getDeletionCooldown.mockResolvedValue(null);
});

test('returns immediately before botReady', async () => {
    const client = makeClient();
    client.botReadyAt = undefined;
    const interaction = baseInteraction({
        isStringSelectMenu: () => true,
        customId: 'ping-protection_panel-menu_target',
        values: ['overview']
    });
    await handler.run(client, interaction);
    expect(mockG.generateUserPanel).not.toHaveBeenCalled();
});

describe('panel-menu select', () => {
    function menuInteraction(selection, isManager = true, isAdmin = true) {
        return baseInteraction({
            member: {
                permissions: {
                    has: jest.fn((perm) => {
                        if (perm === 'Administrator') return isAdmin;
                        if (perm === 'ManageGuild') return isManager;
                        return false;
                    })
                }
            },
            isStringSelectMenu: () => true,
            customId: 'ping-protection_panel-menu_target',
            values: [selection]
        });
    }

    test('blocks non-managers', async () => {
        const interaction = menuInteraction('overview', false, false);
        await handler.run(makeClient(), interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('no-permission');
        expect(mockG.generateUserPanel).not.toHaveBeenCalled();
    });

    test('blocks managers without Admin from opening deletion menu', async () => {
        const interaction = menuInteraction('deletion', true, false);
        await handler.run(makeClient(), interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('no-permission');
        expect(mockG.generatePanelDeletion).not.toHaveBeenCalled();
    });

    test('replies no-data when the user cannot be fetched', async () => {
        const client = makeClient();
        client.users.fetch.mockResolvedValue(null);
        const interaction = menuInteraction('overview');
        await handler.run(client, interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('no-data-found');
    });

    test('routes overview to generateUserPanel', async () => {
        const interaction = menuInteraction('overview');
        await handler.run(makeClient(), interaction);
        expect(mockG.generateUserPanel).toHaveBeenCalled();
        expect(interaction.update).toHaveBeenCalled();
    });

    test('routes history to generateHistoryResponse with isPanel=true', async () => {
        const interaction = menuInteraction('history');
        await handler.run(makeClient(), interaction);
        expect(mockG.generateHistoryResponse).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1, true);
        expect(interaction.update).toHaveBeenCalled();
    });

    test('routes actions to generateActionsResponse with isPanel=true', async () => {
        const interaction = menuInteraction('actions');
        await handler.run(makeClient(), interaction);
        expect(mockG.generateActionsResponse).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1, true);
        expect(interaction.update).toHaveBeenCalled();
    });

    test('routes deletion to generatePanelDeletion for admins', async () => {
        const interaction = menuInteraction('deletion', true, true);
        await handler.run(makeClient(), interaction);
        expect(mockG.generatePanelDeletion).toHaveBeenCalled();
        expect(interaction.update).toHaveBeenCalled();
    });
});

describe('delete-menu select', () => {
    function delInteraction(selection) {
        return baseInteraction({
            member: {permissions: {has: () => true}},
            isStringSelectMenu: () => true,
            customId: 'ping-protection_delete-menu_target',
            values: [selection]
        });
    }

    test('back returns the overview panel', async () => {
        const interaction = delInteraction('back');
        await handler.run(makeClient(), interaction);
        expect(mockG.generateUserPanel).toHaveBeenCalled();
        expect(interaction.update).toHaveBeenCalled();
    });

    test('an active cooldown blocks and replies', async () => {
        mockG.getDeletionCooldown.mockResolvedValue({
            blockedUntil: new Date(Date.now() + 100000),
            lastDeletionType: 'del_ping_history'
        });
        const interaction = delInteraction('del_ping_history');
        await handler.run(makeClient(), interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('err-del-cooldown');
        expect(interaction.showModal).not.toHaveBeenCalled();
    });

    test('a real selection opens the confirmation modal', async () => {
        const interaction = delInteraction('del_ping_history');
        await handler.run(makeClient(), interaction);
        expect(interaction.showModal).toHaveBeenCalled();
    });
});

describe('del-confirm modal submit', () => {
    function modalInteraction(value, selection = 'del_ping_history', timeframe = '') {
        return baseInteraction({
            member: {permissions: {has: () => true}},
            isModalSubmit: () => true,
            customId: `ping-protection_del-confirm_target_${selection}`,
            user: {id: 'admin1'},
            message: {edit: jest.fn().mockResolvedValue()},
            fields: {
                getTextInputValue: jest.fn((id) => {
                    if (id === 'confirm') return value;
                    if (id === 'timeframe') return timeframe;
                    return '';
                })
            }
        });
    }

    test('rejects a wrong confirmation phrase', async () => {
        const interaction = modalInteraction('not the phrase');
        await handler.run(makeClient(), interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('modal-failed');
        expect(mockG.executeDataDeletion).not.toHaveBeenCalled();
    });

    test('runs a partial deletion and sets the cooldown on the correct phrase', async () => {
        const interaction = modalInteraction(localize('ping-protection', 'del-conf-phrase'));
        await handler.run(makeClient(), interaction);
        expect(mockG.executeDataDeletion).toHaveBeenCalledWith(expect.anything(), 'target', 'del_ping_history', null);
        expect(mockG.setDeletionCooldown).toHaveBeenCalledWith(expect.anything(), 'target', 'del_ping_history', 'admin1');
        expect(interaction.reply.mock.calls[0][0].content).toContain('succ-del-tgt');
    });
});

describe('button pagination', () => {
    test('hist-page routes to generateHistoryResponse with the parsed page', async () => {
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'ping-protection_hist-page_target_3'
        });
        await handler.run(makeClient(), interaction);
        expect(mockG.generateHistoryResponse).toHaveBeenCalledWith(expect.anything(), 'target', 3);
        expect(interaction.update).toHaveBeenCalled();
    });

    test('mod-page routes to generateActionsResponse with the parsed page', async () => {
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'ping-protection_mod-page_target_2'
        });
        await handler.run(makeClient(), interaction);
        expect(mockG.generateActionsResponse).toHaveBeenCalledWith(expect.anything(), 'target', 2);
    });

    test('panel-hist routes to generateHistoryResponse with isPanel=true', async () => {
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'ping-protection_panel-hist_target_2'
        });
        await handler.run(makeClient(), interaction);
        expect(mockG.generateHistoryResponse).toHaveBeenCalledWith(expect.anything(), expect.anything(), 2, true);
        expect(interaction.update).toHaveBeenCalled();
    });
});