/*
 * Tests for ping-protection's interactionCreate panel handler.
 *
 * Covers:
 *  - botReady guard
 *  - panel-menu select: admin gate, unknown user, and routing each selection
 *    (overview/history/actions/deletion) to its generator + interaction.update
 *  - delete-menu select: 'back' returns the panel; an active cooldown blocks; a
 *    real selection opens the confirm modal
 *  - del-confirm modal submit: wrong phrase rejected; correct phrase runs a
 *    partial deletion, sets the cooldown, and confirms
 *  - hist-page / mod-page button pagination routes to the right generator
 *
 * Generators and cooldown helpers are mocked.
 */
const mockG = {
    generateHistoryResponse: jest.fn().mockResolvedValue({embeds: ['h']}),
    generateActionsResponse: jest.fn().mockResolvedValue({embeds: ['a']}),
    generateUserPanel: jest.fn().mockResolvedValue({embeds: ['panel']}),
    generatePanelHistory: jest.fn().mockResolvedValue({embeds: ['ph']}),
    generatePanelActions: jest.fn().mockResolvedValue({embeds: ['pa']}),
    generatePanelDeletion: jest.fn().mockResolvedValue({embeds: ['pd']}),
    executeDataDeletion: jest.fn().mockResolvedValue(),
    getDeletionCooldown: jest.fn().mockResolvedValue(null),
    setDeletionCooldown: jest.fn().mockResolvedValue(new Date(Date.now() + 1000)),
    getDeletionTypeLocaleKey: jest.fn(() => 'del-type-pings')
};
jest.mock('../../modules/ping-protection/ping-protection', () => mockG);

const handler = require('../../modules/ping-protection/events/interactionCreate');

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
    function menuInteraction(selection, isAdmin = true) {
        return baseInteraction({
            member: {permissions: {has: () => isAdmin}},
            isStringSelectMenu: () => true,
            customId: 'ping-protection_panel-menu_target',
            values: [selection]
        });
    }

    test('blocks non-admins', async () => {
        const interaction = menuInteraction('overview', false);
        await handler.run(makeClient(), interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('no-permission');
        expect(mockG.generateUserPanel).not.toHaveBeenCalled();
    });

    test('replies no-data when the user cannot be fetched', async () => {
        const client = makeClient();
        client.users.fetch.mockResolvedValue(null);
        const interaction = menuInteraction('overview');
        await handler.run(client, interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('no-data-found');
    });

    test.each([
        ['overview', 'generateUserPanel'],
        ['history', 'generatePanelHistory'],
        ['actions', 'generatePanelActions'],
        ['deletion', 'generatePanelDeletion']
    ])('routes %s to %s and updates', async (selection, fnName) => {
        const interaction = menuInteraction(selection);
        await handler.run(makeClient(), interaction);
        expect(mockG[fnName]).toHaveBeenCalled();
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
    function modalInteraction(value, selection = 'del_ping_history') {
        return baseInteraction({
            member: {permissions: {has: () => true}},
            isModalSubmit: () => true,
            customId: `ping-protection_del-confirm_target_${selection}`,
            user: {id: 'admin1'},
            message: {edit: jest.fn().mockResolvedValue()},
            fields: {getTextInputValue: jest.fn(() => value)}
        });
    }

    test('rejects a wrong confirmation phrase', async () => {
        const interaction = modalInteraction('not the phrase');
        await handler.run(makeClient(), interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('modal-failed');
        expect(mockG.executeDataDeletion).not.toHaveBeenCalled();
    });

    test('runs a partial deletion and sets the cooldown on the correct phrase', async () => {
        // the stub localize returns "ping-protection.modal-phrase"; confirm must equal it
        const interaction = modalInteraction('ping-protection.modal-phrase');
        await handler.run(makeClient(), interaction);
        expect(mockG.executeDataDeletion).toHaveBeenCalledWith(expect.anything(), 'target', 'del_ping_history');
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

    test('panel-hist routes to generatePanelHistory', async () => {
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'ping-protection_panel-hist_target_2'
        });
        await handler.run(makeClient(), interaction);
        expect(mockG.generatePanelHistory).toHaveBeenCalled();
        expect(interaction.update).toHaveBeenCalled();
    });
});