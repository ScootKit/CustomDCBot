/*
 * Covers modules/color-me/events/guildMemberUpdate.js: the boost-driven role
 * lifecycle.
 *  - guards: bot not ready, foreign guild
 *  - removeOnUnboost: deletes the colour role when a member stops boosting
 *  - recreateRole: re-creates the stored colour role when a member starts
 *    boosting and the role no longer exists, then persists the new role id
 *  - rolePosition handling (resolve vs default 0)
 * localize/main are auto-stubbed.
 */
const handler = require('../../modules/color-me/events/guildMemberUpdate');

function makeRoleModel(found) {
    return {
        findOne: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockResolvedValue()
    };
}

function makeGuild({
                       roleExists = false,
                       resolvedRole,
                       positionRole
                   } = {}) {
    return {
        id: 'g1',
        roles: {
            cache: {find: () => (roleExists ? resolvedRole : undefined)},
            resolve: (id) => (id === 'pos-role' ? positionRole : resolvedRole),
            create: jest.fn().mockResolvedValue({id: 'new-role-id'})
        }
    };
}

function makeClient({
                        config,
                        found,
                        guild
                    }) {
    return {
        botReadyAt: Date.now(),
        guild: guild || {
            id: 'g1',
            roles: {create: jest.fn().mockResolvedValue({id: 'new-role-id'})}
        },
        configurations: {'color-me': {config}},
        models: {'color-me': {Role: makeRoleModel(found)}}
    };
}

const conf = (over = {}) => ({
    rolePosition: null,
    removeOnUnboost: false,
    recreateRole: false,
    listRoles: false,
    ...over
});

function member({
                    id = 'u1',
                    premium = null,
                    username = 'name'
                } = {}) {
    return {
        id,
        premiumSince: premium,
        user: {
            id,
            username
        },
        guild: makeGuild()
    };
}

test('does nothing before the bot is ready', async () => {
    const client = makeClient({
        config: conf(),
        found: null
    });
    client.botReadyAt = null;
    const old = member(), neu = member();
    await handler.run(client, old, neu);
    expect(client.models['color-me'].Role.findOne).not.toHaveBeenCalled();
});

test('ignores updates from a foreign guild', async () => {
    const client = makeClient({config: conf()});
    const old = member();
    const neu = member();
    neu.guild = {
        id: 'other',
        roles: {resolve: () => ({position: 0})}
    };
    await handler.run(client, old, neu);
    expect(client.models['color-me'].Role.findOne).not.toHaveBeenCalled();
});

describe('removeOnUnboost', () => {
    test('deletes the colour role when a member stops boosting', async () => {
        const role = {delete: jest.fn()};
        const guild = makeGuild({
            roleExists: true,
            resolvedRole: role
        });
        const client = makeClient({
            config: conf({removeOnUnboost: true}),
            found: {roleID: 'r1'}
        });
        const old = member({premium: new Date()});
        const neu = member({premium: null});
        neu.guild = guild;
        old.guild = guild;
        await handler.run(client, old, neu);
        expect(role.delete).toHaveBeenCalled();
    });

    test('does nothing when the member is still boosting', async () => {
        const role = {delete: jest.fn()};
        const guild = makeGuild({
            roleExists: true,
            resolvedRole: role
        });
        const client = makeClient({
            config: conf({removeOnUnboost: true}),
            found: {roleID: 'r1'}
        });
        const old = member({premium: new Date()});
        const neu = member({premium: new Date()});
        neu.guild = guild;
        await handler.run(client, old, neu);
        expect(role.delete).not.toHaveBeenCalled();
    });

    test('skips deletion when the user has no stored role', async () => {
        const client = makeClient({
            config: conf({removeOnUnboost: true}),
            found: null
        });
        const old = member({premium: new Date()});
        const neu = member({premium: null});
        await handler.run(client, old, neu);
        // findOne resolved null -> nothing to delete, no throw
        expect(client.models['color-me'].Role.findOne).toHaveBeenCalled();
    });
});

describe('recreateRole', () => {
    test('recreates a missing colour role when a member starts boosting and persists the new id', async () => {
        const guild = makeGuild({roleExists: false});
        const client = makeClient({
            config: conf({recreateRole: true}),
            found: {
                roleID: 'old-r',
                name: 'My Colour',
                color: '#abcdef'
            },
            guild
        });
        client.guild = guild;
        const old = member({premium: null});
        const neu = member({premium: new Date()});
        neu.guild = guild;
        await handler.run(client, old, neu);
        expect(guild.roles.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'My Colour',
            color: '#abcdef'
        }));
        expect(client.models['color-me'].Role.update).toHaveBeenCalledWith(
            {roleID: 'new-role-id'},
            {where: {userID: 'u1'}}
        );
    });

    test('does not recreate when the role still exists', async () => {
        const existingRole = {id: 'old-r'};
        const guild = makeGuild({
            roleExists: true,
            resolvedRole: existingRole
        });
        const client = makeClient({
            config: conf({recreateRole: true}),
            found: {
                roleID: 'old-r',
                name: 'X',
                color: '#000000'
            },
            guild
        });
        client.guild = guild;
        const old = member({premium: null});
        const neu = member({premium: new Date()});
        neu.guild = guild;
        await handler.run(client, old, neu);
        expect(guild.roles.create).not.toHaveBeenCalled();
    });

    test('does nothing on recreate when there is no stored record', async () => {
        const guild = makeGuild({roleExists: false});
        const client = makeClient({
            config: conf({recreateRole: true}),
            found: null,
            guild
        });
        client.guild = guild;
        const old = member({premium: null});
        const neu = member({premium: new Date()});
        neu.guild = guild;
        await handler.run(client, old, neu);
        expect(guild.roles.create).not.toHaveBeenCalled();
    });
});

test('resolves the configured rolePosition for the new role position', async () => {
    const positionRole = {position: 12};
    const guild = makeGuild({
        roleExists: false,
        positionRole
    });
    const client = makeClient({
        config: conf({
            recreateRole: true,
            rolePosition: 'pos-role'
        }),
        found: {
            roleID: 'old',
            name: 'n',
            color: '#111111'
        },
        guild
    });
    client.guild = guild;
    const old = member({premium: null});
    const neu = member({premium: new Date()});
    neu.guild = guild;
    await handler.run(client, old, neu);
    expect(guild.roles.create.mock.calls[0][0].position).toBe(12);
});