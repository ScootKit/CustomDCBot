/*
 * Guard-clause tests for the exported duty button handlers
 * (commands/duty.js -> buttonHandlers). These cover the ownership and on-duty
 * state checks that short-circuit before the heavy payload builders:
 *
 *   - handleDutyStartButton: rejects a button pressed by someone other than the
 *     owner, and warns when the user is already on duty
 *   - handleDutyBreakButton: rejects a foreign presser, and warns when the user
 *     is not on duty
 *   - handleDutyEndButton: rejects a foreign presser, and warns when not on duty
 *
 * customIds follow the `duty-mgmt_<action>_<userId>[_<type>]` shape the handlers
 * parse. Models are stubbed; localize comes from the deterministic stub.
 */

const {buttonHandlers} = require('../../modules/staff-management-system/commands/duty');

function makeClient(profile, {shiftConfig = {}} = {}) {
    return {
        configurations: {'staff-management-system': {shifts: shiftConfig}},
        logger: {error: jest.fn()},
        models: {
            'staff-management-system': {
                StaffProfile: {
                    findByPk: jest.fn().mockResolvedValue(profile),
                    upsert: jest.fn().mockResolvedValue(),
                    update: jest.fn().mockResolvedValue()
                },
                StaffShift: {
                    create: jest.fn().mockResolvedValue({}),
                    findOne: jest.fn().mockResolvedValue(null),
                    findAll: jest.fn().mockResolvedValue([])
                }
            }
        }
    };
}

function makeInteraction(customId, userId = 'owner') {
    return {
        customId,
        user: {
            id: userId,
            toString: () => `<@${userId}>`
        },
        guild: {members: {fetch: jest.fn().mockResolvedValue(null)}},
        editReply: jest.fn().mockResolvedValue(),
        followUp: jest.fn().mockResolvedValue()
    };
}

describe('handleDutyStartButton guards', () => {
    test('rejects a press from a non-owner', async () => {
        const client = makeClient(null);
        const interaction = makeInteraction('duty-mgmt_start_owner_Staff', 'someone-else');
        await buttonHandlers.handleDutyStartButton(client, interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-not-yours')
        }));
        expect(client.models['staff-management-system'].StaffShift.create).not.toHaveBeenCalled();
    });

    test('warns when the user is already on duty', async () => {
        const client = makeClient({onDuty: true});
        const interaction = makeInteraction('duty-mgmt_start_owner_Staff', 'owner');
        await buttonHandlers.handleDutyStartButton(client, interaction);
        expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-alr-on')
        }));
        expect(client.models['staff-management-system'].StaffShift.create).not.toHaveBeenCalled();
    });
});

describe('handleDutyBreakButton guards', () => {
    test('rejects a press from a non-owner', async () => {
        const client = makeClient({onDuty: true});
        const interaction = makeInteraction('duty-mgmt_break_owner', 'intruder');
        await buttonHandlers.handleDutyBreakButton(client, interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-not-yours')
        }));
    });

    test('warns when the user is not on duty', async () => {
        const client = makeClient({onDuty: false});
        const interaction = makeInteraction('duty-mgmt_break_owner', 'owner');
        await buttonHandlers.handleDutyBreakButton(client, interaction);
        expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-not-on')
        }));
    });
});

describe('handleDutyEndButton guards', () => {
    test('rejects a press from a non-owner', async () => {
        const client = makeClient({onDuty: true});
        const interaction = makeInteraction('duty-mgmt_end_owner', 'intruder');
        await buttonHandlers.handleDutyEndButton(client, interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-not-yours')
        }));
    });

    test('warns when the user is not on duty', async () => {
        const client = makeClient({onDuty: false});
        const interaction = makeInteraction('duty-mgmt_end_owner', 'owner');
        await buttonHandlers.handleDutyEndButton(client, interaction);
        expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-not-on')
        }));
    });
});