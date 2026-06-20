/*
 * Tests for admin-tools temporaryRoles.createTemporaryRoleChangeAction.
 * Covers: persisting a new scheduled role change (with the change date stored
 * as an epoch ms), and de-duplicating an existing pending change for the same
 * user+role (the old record is destroyed before the new one is created).
 * The schedule date is set in the future so node-schedule never fires here.
 */
const {createTemporaryRoleChangeAction} = require('../../modules/admin-tools/temporaryRoles');

function makeClient({duplicate = null} = {}) {
    const created = {
        id: 'new1',
        changeDate: '0',
        destroy: jest.fn()
    };
    const TemporaryRoleChange = {
        findOne: jest.fn().mockResolvedValue(duplicate),
        create: jest.fn().mockImplementation(async (data) => Object.assign(created, data))
    };
    return {
        models: {'admin-tools': {TemporaryRoleChange}},
        jobs: [],
        guild: {members: {fetch: jest.fn().mockResolvedValue(null)}},
        __created: created
    };
}

test('creates a TemporaryRoleChange storing changeDate as epoch ms', async () => {
    const client = makeClient();
    const when = new Date(Date.now() + 3600000);
    await createTemporaryRoleChangeAction(client, 'remove', when, 'role1', 'user1');
    expect(client.models['admin-tools'].TemporaryRoleChange.create).toHaveBeenCalledWith(
        expect.objectContaining({
            userID: 'user1',
            roleID: 'role1',
            type: 'remove',
            changeDate: when.getTime()
        })
    );
    // A scheduled job for a future date is tracked on the client.
    expect(client.jobs.length).toBe(1);
});

test('destroys an existing pending change for the same user+role before creating the new one', async () => {
    const duplicate = {
        id: 'old1',
        destroy: jest.fn().mockResolvedValue()
    };
    const client = makeClient({duplicate});
    const when = new Date(Date.now() + 3600000);
    await createTemporaryRoleChangeAction(client, 'add', when, 'role1', 'user1');
    expect(duplicate.destroy).toHaveBeenCalled();
    expect(client.models['admin-tools'].TemporaryRoleChange.create).toHaveBeenCalled();
});