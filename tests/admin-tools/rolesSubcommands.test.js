/*
 * Tests for the /roles subcommands give / remove / status
 * (modules/admin-tools/commands/roles.js).
 *
 * beforeSubcommand (covered elsewhere) resolves the member and may set
 * interaction.removeDate; the subcommands themselves:
 *  - bail out immediately if a previous reply already happened
 *    (interaction.replied — the validator failed)
 *  - give/remove: add/remove the role with an audit-log reason, and on success
 *    schedule a temporary inverse change when a removeDate is present, then
 *    confirm via editReply. On failure they surface the error.
 *  - status: lists the user's temporary role actions, or reports none.
 *
 * temporaryRoles.createTemporaryRoleChangeAction is mocked so no DB/timer runs.
 */

const mockCreateChange = jest.fn();
jest.mock('../../modules/admin-tools/temporaryRoles', () => ({
    createTemporaryRoleAction: jest.fn(),
    createTemporaryRoleChangeAction: (...a) => mockCreateChange(...a)
}));

const roles = require('../../modules/admin-tools/commands/roles');
// status reads from the module-level `client` (require('.../main')), not
// interaction.client. Wire the stub's models per-test below.
const stubMain = require('../__stubs__/main');

function makeRole(id = 'r1') {
    return {
        id,
        toString: () => `<@&${id}>`
    };
}

function makeInteraction({
                             replied = false,
                             removeDate = null,
                             role = makeRole(),
                             addResult = 'ok',
                             removeResult = 'ok',
                             tempActions = []
                         } = {}) {
    const member = {
        toString: () => '<@u1>',
        roles: {
            add: addResult === 'ok' ? jest.fn().mockResolvedValue() : jest.fn().mockRejectedValue(new Error('boom')),
            remove: removeResult === 'ok' ? jest.fn().mockResolvedValue() : jest.fn().mockRejectedValue(new Error('boom'))
        }
    };
    return {
        replied,
        removeDate,
        member,
        user: {
            id: 'u1',
            username: 'admin'
        },
        client: {
            bcp47Locale: 'en-US',
            models: {'admin-tools': {TemporaryRoleChange: {findAll: jest.fn().mockResolvedValue(tempActions)}}}
        },
        options: {
            getMember: () => member,
            getRole: () => role,
            getUser: () => ({id: 'u1'})
        },
        editReply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => mockCreateChange.mockClear());

describe('give', () => {
    test('does nothing when the interaction was already replied to', async () => {
        const i = makeInteraction({replied: true});
        await roles.subcommands.give(i);
        expect(i.member.roles.add).not.toHaveBeenCalled();
    });

    test('adds the role and confirms on success', async () => {
        const i = makeInteraction();
        await roles.subcommands.give(i);
        await new Promise(r => setImmediate(r));
        expect(i.member.roles.add).toHaveBeenCalled();
        expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('role-add')}));
        expect(mockCreateChange).not.toHaveBeenCalled();
    });

    test('schedules an inverse removal when a removeDate is set', async () => {
        const removeDate = new Date(Date.now() + 60000);
        const role = makeRole('r5');
        const i = makeInteraction({
            removeDate,
            role
        });
        await roles.subcommands.give(i);
        await new Promise(r => setImmediate(r));
        expect(mockCreateChange).toHaveBeenCalledWith(expect.anything(), 'remove', removeDate, 'r5', 'u1');
    });

    test('reports an error embed when adding the role fails', async () => {
        const i = makeInteraction({addResult: 'fail'});
        await roles.subcommands.give(i);
        await new Promise(r => setImmediate(r));
        expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('unable-to-change-roles')}));
    });
});

describe('remove', () => {
    test('removes the role and schedules an inverse add when timed', async () => {
        const removeDate = new Date(Date.now() + 60000);
        const role = makeRole('r7');
        const i = makeInteraction({
            removeDate,
            role
        });
        await roles.subcommands.remove(i);
        await new Promise(r => setImmediate(r));
        expect(i.member.roles.remove).toHaveBeenCalled();
        expect(mockCreateChange).toHaveBeenCalledWith(expect.anything(), 'add', removeDate, 'r7', 'u1');
    });

    test('surfaces the failure when removing the role rejects', async () => {
        const i = makeInteraction({removeResult: 'fail'});
        await roles.subcommands.remove(i);
        await new Promise(r => setImmediate(r));
        expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('unable-to-change-roles')}));
    });

    test('short-circuits when already replied', async () => {
        const i = makeInteraction({replied: true});
        await roles.subcommands.remove(i);
        expect(i.member.roles.remove).not.toHaveBeenCalled();
    });
});

describe('status', () => {
    test('reports when the user has no temporary actions', async () => {
        const i = makeInteraction({tempActions: []});
        stubMain.client.models = i.client.models;
        await roles.subcommands.status(i);
        expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('user-without-temporary-action')}));
    });

    test('lists each temporary action with its role mention', async () => {
        const tempActions = [
            {
                type: 'add',
                roleID: 'r1',
                changeDate: `${Date.now() + 1000}`
            },
            {
                type: 'remove',
                roleID: 'r2',
                changeDate: `${Date.now() + 2000}`
            }
        ];
        const i = makeInteraction({tempActions});
        stubMain.client.models = i.client.models;
        await roles.subcommands.status(i);
        const content = i.editReply.mock.calls[0][0].content;
        expect(content).toContain('<@&r1>');
        expect(content).toContain('<@&r2>');
        expect(content).toContain('status-add');
        expect(content).toContain('status-remove');
    });

    test('does nothing when already replied', async () => {
        const i = makeInteraction({replied: true});
        await roles.subcommands.status(i);
        expect(i.client.models['admin-tools'].TemporaryRoleChange.findAll).not.toHaveBeenCalled();
    });
});