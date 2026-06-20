/*
 * Behavior tests for the staff-management-system interaction router
 * (events/interactionCreate.js).
 *
 * The router gates and dispatches button/modal/select interactions. These tests
 * exercise the branches that have decision logic rather than heavy embed
 * rendering:
 *   - the customId guard (ignores foreign / unprefixed interactions, and
 *     interactions before the bot is ready)
 *   - LOA approve/deny supervisor permission gating (non-supervisors rejected)
 *   - the "request already handled" guard on a non-PENDING request
 *   - the activity-check (ac-respond) flow: ended check, role requirement,
 *     duplicate-response short-circuit, and a successful log
 *
 * The staff-management helper module and discord.js builders are real (the
 * discordjs-fix shim provides v13 names); models and the interaction object are
 * mocked.
 */

const handler = require('../../modules/staff-management-system/events/interactionCreate');

function baseClient(extra = {}) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        logger: {
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        },
        configurations: {
            'staff-management-system': {
                configuration: {
                    staffRoles: ['staff'],
                    supervisorRoles: ['sup'],
                    managementRoles: ['mgmt']
                },
                status: {
                    loaRole: 'loa-role',
                    raRole: 'ra-role'
                }
            }
        },
        models: {'staff-management-system': {}},
        ...extra
    };
}

function baseInteraction(customId, overrides = {}) {
    return {
        customId,
        guild: {id: 'g1'},
        user: {
            id: 'u1',
            tag: 'U#1'
        },
        member: {
            permissions: {has: () => false},
            roles: {cache: {some: () => false}}
        },
        replied: false,
        deferred: false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        reply: jest.fn().mockResolvedValue(),
        deferUpdate: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        followUp: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

describe('router guards', () => {
    test('ignores interactions before the bot is ready', async () => {
        const client = baseClient({botReadyAt: null});
        const interaction = baseInteraction('staff-mgmt_approve_1');
        await handler.run(client, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('ignores interactions from another guild', async () => {
        const client = baseClient();
        const interaction = baseInteraction('staff-mgmt_approve_1', {guild: {id: 'other'}});
        await handler.run(client, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('ignores customIds without the staff-mgmt / duty-mgmt prefix', async () => {
        const client = baseClient();
        const interaction = baseInteraction('some-other-button');
        await handler.run(client, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(interaction.deferUpdate).not.toHaveBeenCalled();
    });
});

describe('LOA approve/deny permission gating', () => {
    test('rejects a non-supervisor trying to approve', async () => {
        const client = baseClient();
        client.models['staff-management-system'].LoaRequest = {findByPk: jest.fn()};
        client.models['staff-management-system'].StaffProfile = {upsert: jest.fn()};
        const interaction = baseInteraction('staff-mgmt_approve_5');
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: 'staff-management-system.err-gen-no-perm'})
        );
        // never looked up the request because permission failed first
        expect(client.models['staff-management-system'].LoaRequest.findByPk).not.toHaveBeenCalled();
    });

    test('tells the supervisor when the request is already handled', async () => {
        const client = baseClient();
        client.models['staff-management-system'].LoaRequest = {
            findByPk: jest.fn().mockResolvedValue({status: 'APPROVED'})
        };
        client.models['staff-management-system'].StaffProfile = {upsert: jest.fn()};
        const interaction = baseInteraction('staff-mgmt_approve_5', {
            member: {
                permissions: {has: () => false},
                roles: {cache: {some: (fn) => fn({id: 'sup'})}}
            }
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: 'staff-management-system.err-req-hndl(status=APPROVED)'})
        );
    });
});

describe('activity-check ac-respond', () => {
    function acClient({
                          activeCheck,
                          existingResponse = null,
                          targetRoles = '[]'
                      } = {}) {
        const client = baseClient();
        client.models['staff-management-system'].ActivityCheck = {
            findOne: jest.fn().mockResolvedValue(activeCheck ? {
                id: 7,
                targetRoles, ...activeCheck
            } : null)
        };
        client.models['staff-management-system'].ActivityCheckResponse = {
            findOne: jest.fn().mockResolvedValue(existingResponse),
            create: jest.fn().mockResolvedValue()
        };
        return client;
    }

    test('rejects when no active check matches the message', async () => {
        const client = acClient({activeCheck: null});
        const interaction = baseInteraction('staff-mgmt_ac-respond', {message: {id: 'm1'}});
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: 'staff-management-system.err-ac-alr-end'})
        );
    });

    test('rejects a member who lacks a required target role', async () => {
        const client = acClient({
            activeCheck: {},
            targetRoles: JSON.stringify(['needed'])
        });
        const interaction = baseInteraction('staff-mgmt_ac-respond', {
            message: {id: 'm1'},
            member: {
                permissions: {has: () => false},
                roles: {cache: {some: () => false}}
            }
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: 'staff-management-system.err-ac-not-req'})
        );
        expect(client.models['staff-management-system'].ActivityCheckResponse.create).not.toHaveBeenCalled();
    });

    test('short-circuits when the member already responded', async () => {
        const client = acClient({
            activeCheck: {},
            existingResponse: {id: 99}
        });
        const interaction = baseInteraction('staff-mgmt_ac-respond', {message: {id: 'm1'}});
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: 'staff-management-system.info-ac-alr-conf'})
        );
        expect(client.models['staff-management-system'].ActivityCheckResponse.create).not.toHaveBeenCalled();
    });

    test('logs a response and confirms when eligible and not yet responded', async () => {
        const client = acClient({activeCheck: {}});
        const interaction = baseInteraction('staff-mgmt_ac-respond', {message: {id: 'm1'}});
        await handler.run(client, interaction);
        expect(client.models['staff-management-system'].ActivityCheckResponse.create).toHaveBeenCalledWith({
            activityCheckId: 7,
            userId: 'u1'
        });
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: 'staff-management-system.succ-ac-log'})
        );
    });

    test('treats a unique-constraint race as an already-confirmed response', async () => {
        const client = acClient({activeCheck: {}});
        client.models['staff-management-system'].ActivityCheckResponse.create =
            jest.fn().mockRejectedValue(Object.assign(new Error('dup'), {name: 'SequelizeUniqueConstraintError'}));
        const interaction = baseInteraction('staff-mgmt_ac-respond', {message: {id: 'm1'}});
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: 'staff-management-system.info-ac-alr-conf'})
        );
    });
});