const {localize} = require('../../../src/functions/localize');
const {client} = require('../../../main');
const {Op} = require('sequelize');
const {embedType} = require('../../../src/functions/helpers');

module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    const vc = await client.models['temp-channels']['TempChannel'].findOne({
        where: {
            [Op.and]: [
                {id: interaction.member.voice.channelId},
                {creatorID: interaction.member.id}
            ]
        }
    });

    if (!vc) {
        interaction.editReply(interaction.client.configurations['temp-channels']['config']['notInChannel']);
        interaction.cancel = true;
    } else interaction.cancel = false;
};

module.exports.subcommands = {
    'mode': async function (interaction) {
        if (interaction.cancel) return;
        const moduleConfig = interaction.client.configurations['temp-channels']['config'];
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice.channelId},
                    {creatorID: interaction.member.id}
                ]
            }
        });
        const allowedUsers = vc.allowedUsers.split(',');
        const vchann = interaction.guild.channels.cache.get(vc.id);
        if (interaction.options.getBoolean('public')) {
            await vchann.lockPermissions;
            await vchann.permissionOverwrites.delete(vchann.guild.roles.everyone);
            await interaction.editReply(await embedType(moduleConfig['modeSwitched'], {'%mode%': 'public'}, {ephemeral: true}));
        } else if (!interaction.options.getBoolean('public')) {
            await vchann.lockPermissions;
            await vchann.permissionOverwrites.create(vchann.guild.roles.everyone, {'CONNECT': false});
            if (allowedUsers.at(0) !== '') {
                for (const user of allowedUsers) {
                    await vchann.permissionOverwrites.create(interaction.guild.members.cache.get(user), {'CONNECT': true});
                }
            }
            interaction.editReply(await embedType(moduleConfig['modeSwitched'], {'%mode%': 'private'}, {ephemeral: true}));
        }
        vc.isPublic = interaction.options.getBoolean('public');
        await vc.save;
    },
    'add-user': async function (interaction) {
        if (interaction.cancel) return;
        const moduleConfig = interaction.client.configurations['temp-channels']['config'];
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice.channelId},
                    {creatorID: interaction.member.id}
                ]
            }
        });
        let allowedUsers = vc.allowedUsers;
        if (allowedUsers === '') {
            allowedUsers = interaction.options.getUser('user').id;
        } else {
            allowedUsers = allowedUsers + ',' + interaction.options.getUser('user').id;
        }
        vc.allowedUsers = allowedUsers;
        await vc.save();
        const vchann = interaction.guild.channels.cache.get(vc.id);
        if (!await vchann.permissionsFor(vchann.guild.roles.everyone).has('CONNECT')) {
            await vchann.permissionOverwrites.create(interaction.options.getUser('user'), {'CONNECT': true});
        }
        interaction.editReply(await embedType(moduleConfig['userAdded'], {'%user%': interaction.options.getUser('user').tag}, {ephemeral: true}));
    },
    'remove-user': async function (interaction) {
        if (interaction.cancel) return;
        const moduleConfig = interaction.client.configurations['temp-channels']['config'];
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice.channelId},
                    {creatorID: interaction.member.id}
                ]
            }
        });
        let allowedUsers = vc.allowedUsers.split(',');
        const user = interaction.options.getUser('user').id;
        allowedUsers = allowedUsers.filter((e => e !== user));
        allowedUsers = allowedUsers.toString();
        vc.allowedUsers = allowedUsers;
        await vc.save();
        const vchann = interaction.guild.channels.cache.get(vc.id);
        try {
            await vchann.permissionOverwrites.delete(interaction.options.getUser('user'));
        } catch (e) {
            console.log(e);
        }
        const usr = interaction.guild.members.cache.get(interaction.options.getUser('user').id);
        if (usr.voice.channelId === vc.id) {
            try {
                await usr.voice.disconnect();
            } catch (e) {
                interaction.editReply(localize('temp-channels', 'no-disconnect'));
                return;
            }
        }
        interaction.editReply(await embedType(moduleConfig['userRemoved'], {'%user%': interaction.options.getUser('user').tag}, {ephemeral: true}));
    },
    'list-users': async function (interaction) {
        if (interaction.cancel) return;
        const moduleConfig = interaction.client.configurations['temp-channels']['config'];
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice.channelId},
                    {creatorID: interaction.member.id}
                ]
            }
        });
        const allowedUsersArray = vc.allowedUsers.split(',');
        let allowedUsers = '';
        for (const user of allowedUsersArray) {
            allowedUsers = allowedUsers + '\n • <@' + user + '>';
        }
        if (allowedUsersArray.at(0) === '') {
            interaction.editReply(localize('temp-channels', 'no-added-user'));
            return;
        }
        interaction.editReply(moduleConfig['listUsers'] + ' ' + allowedUsers);
    },
    'edit': async function (interaction) {
        if (interaction.cancel) return;
        const moduleConfig = interaction.client.configurations['temp-channels']['config'];
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice.channelId},
                    {creatorID: interaction.member.id}
                ]
            }
        });
        const vchann = interaction.guild.channels.cache.get(vc.id);
        let edited = 0;
        let vcNsfw;
        let vcBitrate;
        let vcLimit;
        let vcName;

        if (interaction.options.getInteger('user-limit') >= 0) {
            if (interaction.options.getInteger('user-limit') < 0 || interaction.options.getInteger('user-limit') > 99) {
                interaction.editReply(localize('temp-channels', 'edit-error'));
                return;
            }
            vcLimit = interaction.options.getInteger('user-limit');
            edited++;
        } else vcLimit = vchann.userLimit;
        if (interaction.options.getInteger('bitrate')) {
            if (interaction.options.getInteger('bitrate') <= 8000 || interaction.options.getInteger('bitrate') >= interaction.guild.maximumBitrate) {
                interaction.editReply(localize('temp-channels', 'edit-error'));
                return;
            }
            vcBitrate = interaction.options.getInteger('bitrate');
            edited++;
        } else vcBitrate = vchann.bitrate;
        if (interaction.options.getString('name')) {
            vcName = interaction.options.getString('name');
            edited++;
        } else vcName = vchann.name;
        if (interaction.options.getBoolean('nsfw')) {
            vcNsfw = interaction.options.getBoolean('nsfw');
            edited++;
        } else vcNsfw = vchann.nsfw;

        if (edited !== 0) {
            interaction.editReply(await embedType(moduleConfig['channelEdited'], {}, {ephemeral: true}));
            try {
                vchann.edit({userLimit: vcLimit, nsfw: vcNsfw, name: vcName, bitrate: vcBitrate});
            } catch (e) {
                interaction.editReply(localize('temp-channels', 'edit-error'));
            }
        } else {
            interaction.editReply(localize('temp-channels', 'nothing-changed'));
        }
    }
};

module.exports.config = {
    name: 'temp-channel',
    description: localize('temp-channels', 'command-description'),
    defaultPermission: false,
    options: function () {
        const moduleConfig = client.configurations['temp-channels']['config'];
        const conf = [];
        if (moduleConfig['allowUserToChangeMode']) {
            conf.push(
                {
                    type: 'SUB_COMMAND',
                    name: 'mode',
                    description: localize('temp-channels', 'mode-subcommand-description'),
                    options: [
                        {
                            type: 'BOOLEAN',
                            required: true,
                            name: 'public',
                            description: localize('temp-channels', 'public-option-description')
                        }
                    ]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'add-user',
                    description: localize('temp-channels', 'add-subcommand-description'),
                    options: [
                        {
                            type: 'USER',
                            required: true,
                            name: 'user',
                            description: localize('temp-channels', 'add-user-option-description')
                        }
                    ]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'remove-user',
                    description: localize('temp-channels', 'remove-subcommand-description'),
                    options: [
                        {
                            type: 'USER',
                            required: true,
                            name: 'user',
                            description: localize('temp-channels', 'remove-user-option-description')
                        }
                    ]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'list-users',
                    description: localize('temp-channels', 'list-subcommand-description')
                }
            );
        }

        if (moduleConfig['allowUserToChangeName']) {
            conf.push(
                {
                    type: 'SUB_COMMAND',
                    name: 'edit',
                    description: localize('temp-channels', 'edit-subcommand-description'),
                    options: [
                        {
                            type: 'INTEGER',
                            required: false,
                            name: 'user-limit',
                            description: localize('temp-channels', 'user-limit-option-description')
                        },
                        {
                            type: 'INTEGER',
                            required: false,
                            name: 'bitrate',
                            description: localize('temp-channels', 'bitrate-option-description')
                        },
                        {
                            type: 'STRING',
                            required: false,
                            name: 'name',
                            description: localize('temp-channels', 'name-option-description')
                        },
                        {
                            type: 'BOOLEAN',
                            required: false,
                            name: 'nsfw',
                            description: localize('temp-channels', 'nsfw-option-description')
                        }
                    ]
                }
            );
        }
        return conf;
    }

};