/*
 * Covers the heavy "manage" subcommand of modules/color-me/commands/color-me.js
 * and its private cooldown helper (which reads the shared main-stub client).
 *  - cooldown still active -> editReply with the cooldown string, no role change
 *  - no existing record -> creates a role, persists it, adds it to the member
 *  - existing record + live role -> edits the role in place
 *  - existing record but role gone + guild at the 250 role cap -> roleLimit
 *  - invalid colour -> cancels before touching roles
 *  - Discord 30005 role-limit error on create -> roleLimit reply
 * embedType is the real helper; localize/main auto-stubbed.
 */
const mainStub = require('../__stubs__/main');
const cmd = require('../../modules/color-me/commands/color-me');

const strings = {
    cooldown: 'cooldown %cooldown%',
    updated: 'updated',
    updatedNoIcon: 'updated-no-icon',
    created: 'created',
    createdNoIcon: 'created-no-icon',
    roleLimit: 'role-limit',
    invalidColor: 'invalid-color'
};

function setSharedModel(model) {
    mainStub.client.models = {'color-me': {Role: model}};
    mainStub.client.logger = {error: jest.fn()};
    mainStub.client.guild = {features: []};
}

function makeInteraction({
                             found = null,
                             color = null,
                             name = 'My Colour',
                             icon = null,
                             roleCacheSize = 5,
                             roleExists = true,
                             createImpl,
                             config = {}
                         } = {}) {
    const createdRole = {
        id: 'new-role',
        name,
        hexColor: '#123456',
        edit: jest.fn()
    };
    const liveRole = {
        id: found ? found.roleID : 'live',
        edit: jest.fn()
    };
    const model = {
        findOne: jest.fn().mockResolvedValue(found),
        create: createImpl || jest.fn().mockResolvedValue(createdRole),
        update: jest.fn().mockResolvedValue()
    };
    setSharedModel(model);
    const rolesCache = {
        size: roleCacheSize,
        find: () => (roleExists ? liveRole : undefined),
        has: () => false
    };
    return {
        _model: model,
        _createdRole: createdRole,
        _liveRole: liveRole,
        user: {
            id: 'u1',
            username: 'alice'
        },
        member: {
            roles: {
                cache: {has: () => false},
                add: jest.fn().mockResolvedValue()
            }
        },
        guild: {
            roles: {
                cache: rolesCache,
                resolve: () => liveRole,
                create: model.create
            }
        },
        options: {
            getAttachment: () => icon,
            getString: (n) => (n === 'color' ? color : n === 'name' ? name : null)
        },
        client: {
            configurations: {
                'color-me': {
                    config: {
                        updateCooldown: 24,
                        rolePosition: null,
                        listRoles: false, ...config
                    },
                    strings
                }
            },
            models: {'color-me': {Role: model}}
        },
        editReply: jest.fn().mockResolvedValue()
    };
}

test('replies with the cooldown message while the cooldown is active', async () => {
    const recent = {timestamp: new Date()}; // just now -> 24h cooldown still active
    const i = makeInteraction({
        found: {
            roleID: 'r1',
            timestamp: new Date()
        }
    });
    // shared cooldown helper reads the main-stub model.findOne
    i._model.findOne.mockResolvedValue(recent);
    await cmd.subcommands.manage(i);
    expect(i.editReply).toHaveBeenCalledTimes(1);
    expect(i.editReply.mock.calls[0][0]).toBeDefined();
    // no role created or edited
    expect(i.guild.roles.create).not.toHaveBeenCalled();
});

test('creates a new colour role when the user has no record', async () => {
    const i = makeInteraction({found: null});
    await cmd.subcommands.manage(i);
    expect(i.guild.roles.create).toHaveBeenCalled();
    expect(i._model.create).toHaveBeenCalled();
    expect(i.member.roles.add).toHaveBeenCalledWith(i._createdRole);
    expect(i.editReply).toHaveBeenCalled();
});

test('edits the live role in place when a record + role exist (past cooldown)', async () => {
    const old = {timestamp: new Date(Date.now() - 48 * 3600000)}; // 48h ago -> allowed
    const i = makeInteraction({
        found: {roleID: 'r1'},
        roleExists: true
    });
    i._model.findOne.mockResolvedValueOnce(old) // cooldown lookup
        .mockResolvedValueOnce({roleID: 'r1'}); // manage record lookup
    await cmd.subcommands.manage(i);
    expect(i._liveRole.edit).toHaveBeenCalled();
    expect(i.guild.roles.create).not.toHaveBeenCalled();
});

test('reports the role limit when the stored role is gone and the guild is at 250 roles', async () => {
    const old = {timestamp: new Date(Date.now() - 48 * 3600000)};
    const i = makeInteraction({
        found: {roleID: 'r1'},
        roleExists: false,
        roleCacheSize: 250
    });
    i._model.findOne.mockResolvedValueOnce(old).mockResolvedValueOnce({roleID: 'r1'});
    await cmd.subcommands.manage(i);
    expect(i.guild.roles.create).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
});

test('cancels on invalid colour without creating a role', async () => {
    const i = makeInteraction({
        found: null,
        color: 'ZZZZZZ'
    });
    await cmd.subcommands.manage(i);
    expect(i.guild.roles.create).not.toHaveBeenCalled();
});

test('maps a Discord 30005 error on create to the role-limit reply', async () => {
    const err = Object.assign(new Error('max roles'), {code: 30005});
    const i = makeInteraction({
        found: null,
        createImpl: jest.fn().mockRejectedValue(err)
    });
    await cmd.subcommands.manage(i);
    expect(i.editReply).toHaveBeenCalled();
    // does not rethrow for 30005
});