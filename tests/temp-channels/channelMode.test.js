/*
 * Behavior tests for temp-channels channel-settings.channelMode and channelEdit.
 *
 * channelMode flips a temp voice channel between public and private, reconfiguring
 * permission overwrites for @everyone / the bot / the creator / allowed users /
 * privateBypassRoles, and persists the new isPublic flag. channelEdit validates and
 * applies user-limit / bitrate / name / nsfw changes from either the slash command
 * or the edit modal, rejecting out-of-range values and reporting "nothing changed".
 * The DB client comes from ../../main (jest-mapped stub) which we mutate per test;
 * embedType runs for real.
 */
const mainStub = require('../__stubs__/main');
const settings = require('../../modules/temp-channels/channel-settings');

function setVC(vc) {
    mainStub.client.models = {'temp-channels': {TempChannel: {findOne: jest.fn().mockResolvedValue(vc)}}};
}

function makeVchann() {
    return {
        id: 'vc1',
        nsfw: false,
        bitrate: 64000,
        userLimit: 0,
        name: 'Old Name',
        guild: {roles: {everyone: 'everyone-role'}},
        lockPermissions: jest.fn().mockResolvedValue(),
        permissionOverwrites: {create: jest.fn().mockResolvedValue()},
        edit: jest.fn()
    };
}

function makeInteraction({
                             vc,
                             vchann,
                             config = {},
                             membersCache = new Map(),
                             me = 'bot-me'
                         }) {
    return {
        client: {
            configurations: {
                'temp-channels': {
                    config: {
                        modeSwitched: 'Mode now %mode%',
                        channelEdited: 'edited',
                        'edit-error': 'edit-error',
                        ...config
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
            members: {
                me,
                cache: membersCache
            },
            maximumBitrate: 384000
        },
        options: {
            getBoolean: jest.fn(),
            getInteger: jest.fn(),
            getString: jest.fn()
        },
        fields: {
            getTextInputValue: jest.fn(),
            getStringSelectValues: jest.fn()
        },
        editReply: jest.fn().mockResolvedValue()
    };
}

describe('channelMode', () => {
    test('public: locks perms, grants the bot manage rights, saves isPublic=true', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator',
            isPublic: false,
            save: jest.fn().mockResolvedValue()
        };
        setVC(vc);
        const vchann = makeVchann();
        const interaction = makeInteraction({
            vc,
            vchann
        });
        interaction.options.getBoolean = jest.fn().mockReturnValue(true);

        await settings.channelMode(interaction, 'command');

        expect(vchann.lockPermissions).toHaveBeenCalled();
        expect(vchann.permissionOverwrites.create).toHaveBeenCalledWith('bot-me', expect.objectContaining({
            CONNECT: true,
            MANAGE_CHANNELS: true
        }));
        expect(vc.isPublic).toBe(true);
        expect(vc.save).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'Mode now public'}));
    });

    test('buttonPublic caller forces public mode', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator',
            isPublic: false,
            save: jest.fn().mockResolvedValue()
        };
        setVC(vc);
        const vchann = makeVchann();
        const interaction = makeInteraction({
            vc,
            vchann
        });
        await settings.channelMode(interaction, 'buttonPublic');
        expect(vchann.lockPermissions).toHaveBeenCalled();
        expect(vc.isPublic).toBe(true);
    });

    test('private: denies everyone, re-grants allowed users and bypass roles, saves isPublic=false', async () => {
        const allowedMember = {id: 'friend'};
        const vc = {
            id: 'vc1',
            allowedUsers: 'creator,friend',
            isPublic: true,
            save: jest.fn().mockResolvedValue()
        };
        setVC(vc);
        const vchann = makeVchann();
        const membersCache = new Map([['creator', {id: 'creator'}], ['friend', allowedMember]]);
        const interaction = makeInteraction({
            vc,
            vchann,
            membersCache,
            config: {privateBypassRoles: ['mod-role']}
        });
        interaction.options.getBoolean = jest.fn().mockReturnValue(false);

        await settings.channelMode(interaction, 'command');

        // everyone denied
        expect(vchann.permissionOverwrites.create).toHaveBeenCalledWith('everyone-role', {
            CONNECT: false,
            VIEW_CHANNEL: false
        });
        // allowed user re-granted
        expect(vchann.permissionOverwrites.create).toHaveBeenCalledWith(allowedMember, {
            CONNECT: true,
            VIEW_CHANNEL: true
        });
        // bypass role granted
        expect(vchann.permissionOverwrites.create).toHaveBeenCalledWith('mod-role', {
            CONNECT: true,
            VIEW_CHANNEL: true
        });
        expect(vc.isPublic).toBe(false);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'Mode now private'}));
    });
});

describe('channelEdit (command)', () => {
    test('applies name + user-limit changes and edits the channel', async () => {
        const vc = {id: 'vc1'};
        setVC(vc);
        const vchann = makeVchann();
        const interaction = makeInteraction({
            vc,
            vchann
        });
        interaction.options.getInteger = jest.fn((k) => k === 'user-limit' ? 5 : 0);
        interaction.options.getString = jest.fn((k) => k === 'name' ? 'New Name' : null);
        interaction.options.getBoolean = jest.fn().mockReturnValue(false);

        await settings.channelEdit(interaction, 'command');

        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'edited'}));
        expect(vchann.edit).toHaveBeenCalledWith(expect.objectContaining({
            userLimit: 5,
            name: 'New Name'
        }));
    });

    test('rejects an out-of-range bitrate with the edit-error message', async () => {
        const vc = {id: 'vc1'};
        setVC(vc);
        const vchann = makeVchann();
        const interaction = makeInteraction({
            vc,
            vchann
        });
        // user-limit defaulted (-1 so the >=0 guard is false), bitrate too low (<=8000)
        interaction.options.getInteger = jest.fn((k) => k === 'bitrate' ? 8000 : -1);
        interaction.options.getString = jest.fn().mockReturnValue(null);
        interaction.options.getBoolean = jest.fn().mockReturnValue(false);

        await settings.channelEdit(interaction, 'command');

        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'edit-error'}));
        expect(vchann.edit).not.toHaveBeenCalled();
    });

    test('reports nothing-changed when no option was provided', async () => {
        const vc = {id: 'vc1'};
        setVC(vc);
        const vchann = makeVchann();
        const interaction = makeInteraction({
            vc,
            vchann
        });
        // user-limit negative (skips the >=0 branch), bitrate null (falsy), no name, nsfw false
        interaction.options.getInteger = jest.fn((k) => k === 'user-limit' ? -1 : null);
        interaction.options.getString = jest.fn().mockReturnValue(null);
        interaction.options.getBoolean = jest.fn().mockReturnValue(false);

        await settings.channelEdit(interaction, 'command');

        expect(interaction.editReply).toHaveBeenCalledWith('temp-channels.nothing-changed');
        expect(vchann.edit).not.toHaveBeenCalled();
    });
});

describe('channelEdit (modal)', () => {
    test('rejects a non-numeric limit input', async () => {
        const vc = {id: 'vc1'};
        setVC(vc);
        const vchann = makeVchann();
        const interaction = makeInteraction({
            vc,
            vchann
        });
        interaction.fields.getTextInputValue = jest.fn((k) => k === 'edit-modal-limit-input' ? 'abc' : 'X');

        await settings.channelEdit(interaction, 'modal');

        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'edit-error'}));
        expect(vchann.edit).not.toHaveBeenCalled();
    });

    test('applies modal values (limit, bitrate, name, nsfw)', async () => {
        const vc = {id: 'vc1'};
        setVC(vc);
        const vchann = makeVchann();
        const interaction = makeInteraction({
            vc,
            vchann
        });
        interaction.fields.getTextInputValue = jest.fn((k) => {
            if (k === 'edit-modal-limit-input') return '10';
            if (k === 'edit-modal-name-input') return 'Modal Name';
            return '';
        });
        interaction.fields.getStringSelectValues = jest.fn((k) =>
            k === 'edit-modal-bitrate-input' ? ['96000'] : ['true']);

        await settings.channelEdit(interaction, 'modal');

        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'edited'}));
        expect(vchann.edit).toHaveBeenCalledWith(expect.objectContaining({
            userLimit: '10',
            bitrate: 96000,
            name: 'Modal Name',
            nsfw: true
        }));
    });
});