/*
 * Behavior tests for temp-channels channel-settings (userAdd / userRemove / usersList).
 *
 * These functions read/modify the comma-separated allowedUsers list on the
 * TempChannel row and grant/revoke channel permissions accordingly. The module
 * pulls the DB client from `../../main`, which the jest moduleNameMapper aliases
 * to the test stub; we mutate that stub's client per test.
 *
 * Covered: deduplication when adding an already-allowed user, appending a new
 * user (+ persisting), removing a user from the list and revoking access /
 * disconnecting them, and the "no users" / not-in-channel branches of usersList.
 */
const mainStub = require('../__stubs__/main');
const settings = require('../../modules/temp-channels/channel-settings');

function makeVchann(everyoneHasAccess = false) {
    const perms = {has: () => everyoneHasAccess};
    return {
        id: 'vc1',
        guild: {roles: {everyone: 'everyone-role'}},
        permissionsFor: jest.fn().mockReturnValue(perms),
        permissionOverwrites: {
            create: jest.fn().mockResolvedValue(),
            delete: jest.fn().mockResolvedValue()
        }
    };
}

function makeInteraction({
                             vc,
                             vchann,
                             members = new Map()
                         }) {
    return {
        client: {
            configurations: {
                'temp-channels': {
                    config: {
                        userAdded: 'temp-channels.userAdded',
                        userRemoved: 'temp-channels.userRemoved',
                        notInChannel: 'temp-channels.notInChannel',
                        listUsers: 'Allowed: %users%'
                    }
                }
            }
        },
        member: {
            id: 'creator',
            voice: {channelId: 'vc1'}
        },
        guild: {
            channels: {cache: {get: () => vchann}},
            members: {cache: members}
        },
        options: {getUser: jest.fn()},
        editReply: jest.fn().mockResolvedValue()
    };
}

function setupClient(vc, users = {}) {
    mainStub.client.models = {'temp-channels': {TempChannel: {findOne: jest.fn().mockResolvedValue(vc)}}};
    mainStub.client.users = {fetch: jest.fn(id => Promise.resolve(users[id] || null))};
}

describe('userAdd', () => {
    test('appends a new user, persists, and replies with the added-user message', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator',
            isPublic: false,
            save: jest.fn().mockResolvedValue()
        };
        setupClient(vc);
        const vchann = makeVchann(false);
        const interaction = makeInteraction({
            vc,
            vchann
        });
        interaction.options.getUser = jest.fn().mockReturnValue({
            id: 'newuser',
            username: 'New',
            discriminator: '0',
            tag: 'New#0'
        });

        await settings.userAdd(interaction, 'command');

        expect(vc.allowedUsers).toBe('creator,newuser');
        expect(vc.save).toHaveBeenCalled();
        // everyone lacks access -> grant the new user explicit access
        expect(vchann.permissionOverwrites.create).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalled();
    });

    test('does not duplicate an already-allowed user', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator,existing',
            isPublic: false,
            save: jest.fn().mockResolvedValue()
        };
        setupClient(vc);
        const vchann = makeVchann(false);
        const interaction = makeInteraction({
            vc,
            vchann
        });
        interaction.options.getUser = jest.fn().mockReturnValue({
            id: 'existing',
            username: 'Ex',
            discriminator: '0',
            tag: 'Ex#0'
        });

        await settings.userAdd(interaction, 'command');

        expect(vc.allowedUsers).toBe('creator,existing'); // unchanged
        expect(vc.save).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalled();
    });

    test('does not grant an explicit overwrite when the channel is already public to everyone', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator',
            isPublic: true,
            save: jest.fn().mockResolvedValue()
        };
        setupClient(vc);
        const vchann = makeVchann(true); // everyone already has CONNECT + VIEW
        const interaction = makeInteraction({
            vc,
            vchann
        });
        interaction.options.getUser = jest.fn().mockReturnValue({
            id: 'newuser',
            username: 'New',
            discriminator: '0',
            tag: 'New#0'
        });

        await settings.userAdd(interaction, 'command');

        expect(vc.allowedUsers).toBe('creator,newuser');
        expect(vchann.permissionOverwrites.create).not.toHaveBeenCalled();
    });
});

describe('userRemove', () => {
    test('removes the user from the list and revokes access on a private channel', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator,target',
            isPublic: false,
            save: jest.fn().mockResolvedValue()
        };
        setupClient(vc);
        const vchann = makeVchann(false);
        const removedUser = {
            id: 'target',
            username: 'T',
            discriminator: '0',
            tag: 'T#0'
        };
        const members = new Map([['target', {
            voice: {
                channelId: 'other',
                disconnect: jest.fn()
            }
        }]]);
        const interaction = makeInteraction({
            vc,
            vchann,
            members
        });
        interaction.options.getUser = jest.fn().mockReturnValue(removedUser);

        await settings.userRemove(interaction, 'command');

        expect(vc.allowedUsers).toBe('creator');
        expect(vc.save).toHaveBeenCalled();
        // private channel -> deny via create, not delete
        expect(vchann.permissionOverwrites.create).toHaveBeenCalledWith(removedUser, {
            CONNECT: false,
            VIEW_CHANNEL: false
        });
        expect(interaction.editReply).toHaveBeenCalled();
    });

    test('deletes the overwrite (rather than denying) on a public channel and disconnects an in-channel member', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator,target',
            isPublic: true,
            save: jest.fn().mockResolvedValue()
        };
        setupClient(vc);
        const vchann = makeVchann(false);
        const removedUser = {
            id: 'target',
            username: 'T',
            discriminator: '0',
            tag: 'T#0'
        };
        const disconnect = jest.fn().mockResolvedValue();
        const members = new Map([['target', {
            voice: {
                channelId: 'vc1',
                disconnect
            }
        }]]);
        const interaction = makeInteraction({
            vc,
            vchann,
            members
        });
        interaction.options.getUser = jest.fn().mockReturnValue(removedUser);

        await settings.userRemove(interaction, 'command');

        expect(vchann.permissionOverwrites.delete).toHaveBeenCalledWith(removedUser);
        // member sits in the temp channel -> disconnected
        expect(disconnect).toHaveBeenCalled();
    });
});

describe('usersList', () => {
    test('replies with notInChannel when the caller does not own a temp channel', async () => {
        setupClient(null);
        const interaction = makeInteraction({
            vc: null,
            vchann: makeVchann()
        });

        await settings.usersList(interaction);

        const arg = interaction.editReply.mock.calls[0][0];
        expect(JSON.stringify(arg)).toContain('notInChannel');
    });

    test('replies with a no-added-user notice when the list is empty', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: ''
        };
        setupClient(vc);
        const interaction = makeInteraction({
            vc,
            vchann: makeVchann()
        });

        await settings.usersList(interaction);

        const arg = interaction.editReply.mock.calls[0][0];
        expect(JSON.stringify(arg)).toContain('no-added-user');
    });

    test('lists allowed users as mentions when present', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'aaa,bbb'
        };
        setupClient(vc);
        const interaction = makeInteraction({
            vc,
            vchann: makeVchann()
        });

        await settings.usersList(interaction);

        const arg = interaction.editReply.mock.calls[0][0];
        const text = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(text).toContain('<@aaa>');
        expect(text).toContain('<@bbb>');
    });
});