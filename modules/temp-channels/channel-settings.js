const {client} = require('../../main');
const {Op} = require('sequelize');
const {embedType, formatDiscordUserName} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

/**
 * @param interaction
 * @param callerInfo
 * @returns {Promise<void>}
 */
module.exports.channelMode = async function (interaction, callerInfo) {
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

    let publicTemp = null;
    if (callerInfo === 'command') {
        publicTemp = interaction.options.getBoolean('public');
    } else if (callerInfo === 'buttonPublic') {
        publicTemp = true;
    } else if (callerInfo === 'buttonPrivate') {
        publicTemp = false;
    }
    if (publicTemp) {

        await vchann.lockPermissions;
        await vchann.permissionOverwrites.delete(vchann.guild.roles.everyone);
        await interaction.editReply(embedType(moduleConfig['modeSwitched'], {'%mode%': 'public'}, {ephemeral: true}));

    } else if (!publicTemp) {

        await vchann.lockPermissions;
        await vchann.permissionOverwrites.create(vchann.guild.roles.everyone, {'CONNECT': false});
        if (allowedUsers.at(0) !== '') {
            for (const user of allowedUsers) {
                await vchann.permissionOverwrites.create(interaction.guild.members.cache.get(user), {'CONNECT': true});
            }
        }
        interaction.editReply(embedType(moduleConfig['modeSwitched'], {'%mode%': 'private'}, {ephemeral: true}));
    }

    vc.isPublic = publicTemp;
    await vc.save;
};

/**
 * @param interaction
 * @param callerInfo
 * @returns {Promise<void>}
 */
module.exports.userAdd = async function (interaction, callerInfo) {
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
    let addedUser = null;
    if (callerInfo === 'command') {
        addedUser = interaction.options.getUser('user');
    }
    if (callerInfo === 'modal') {
        const addedUserString = interaction.fields.getTextInputValue('add-modal-input');
        try {
            addedUser = interaction.guild.members.cache.find(member => formatDiscordUserName(member.user).replaceAll('@', '') === addedUserString).user;
        } catch (e) {
            try {
                addedUser = await client.users.fetch(addedUserString);
            } catch {
                interaction.editReply(localize('temp-channels', 'user-not-found'));
                return;
            }
        }
    }

    if (allowedUsers === '') {
        allowedUsers = addedUser.id;
    } else {
        allowedUsers = allowedUsers + ',' + addedUser.id;
    }
    vc.allowedUsers = allowedUsers;
    await vc.save();
    const vchann = interaction.guild.channels.cache.get(vc.id);
    if (!await vchann.permissionsFor(vchann.guild.roles.everyone).has('CONNECT') || !await vchann.permissionsFor(vchann.guild.roles.everyone).has('VIEW_CHANNEL')) {
        await vchann.permissionOverwrites.create(addedUser, {'CONNECT': true, 'VIEW_CHANNEL': true});
    }
    await interaction.editReply(embedType(moduleConfig['userAdded'], {'%user%': formatDiscordUserName(addedUser)}, {ephemeral: true}));
};

/**
 *
 * @param interaction
 * @param callerInfo
 * @returns {Promise<void>}
 */
module.exports.userRemove = async function (interaction, callerInfo) {
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
    let removedUser = null;
    if (callerInfo === 'command') {
        removedUser = interaction.options.getUser('user');
    }
    if (callerInfo === 'modal') {
        const removedUserString = interaction.fields.getTextInputValue('remove-modal-input');
        try {
            removedUser = interaction.guild.members.cache.find(member => formatDiscordUserName(member.user).replaceAll('@', '') === removedUserString).user;
        } catch (e) {
            try {
                removedUser = await client.users.fetch(removedUserString);
            } catch (f) {
                interaction.editReply(localize('temp-channels', 'user-not-found'));
                return;
            }
        }
    }
    const user = removedUser.id;
    allowedUsers = allowedUsers.filter((e => e !== user));
    allowedUsers = allowedUsers.toString();
    vc.allowedUsers = allowedUsers;
    await vc.save();
    const vchann = interaction.guild.channels.cache.get(vc.id);
    try {
        await vchann.permissionOverwrites.delete(removedUser);
    } catch (e) {
        console.log(e);
    }
    const usr = interaction.guild.members.cache.get(removedUser.id);
    if (usr.voice.channelId === vc.id) {
        try {
            await usr.voice.disconnect();
        } catch (e) {
            interaction.editReply(localize('temp-channels', 'no-disconnect'));
            return;
        }
    }
    interaction.editReply(embedType(moduleConfig['userRemoved'], {'%user%': formatDiscordUserName(removedUser)}, {ephemeral: true}));
};

module.exports.usersList = async function (interaction) {
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
};

module.exports.channelEdit = async function (interaction, callerInfo) {
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
    let vcNsfw = vchann.nsfw;
    let vcBitrate = vchann.bitrate;
    let vcLimit = vchann.userLimit;
    let vcName = vchann.name;
    if (callerInfo === 'command') {
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
    }
    if (callerInfo === 'modal') {
        if (isNaN(interaction.fields.getTextInputValue('edit-modal-limit-input'))) {
            interaction.editReply(localize('temp-channels', 'edit-error'));
            return;
        }
        if (interaction.fields.getTextInputValue('edit-modal-limit-input') < 0 || interaction.fields.getTextInputValue('edit-modal-limit-input') > 99) {
            interaction.editReply(localize('temp-channels', 'edit-error'));
            return;
        }
        if (isNaN(interaction.fields.getTextInputValue('edit-modal-bitrate-input'))) {
            interaction.editReply(localize('temp-channels', 'edit-error'));
            return;
        }
        if (interaction.fields.getTextInputValue('edit-modal-bitrate-input') <= 8000 || interaction.fields.getTextInputValue('edit-modal-bitrate-input') >= interaction.guild.maximumBitrate) {
            interaction.editReply(localize('temp-channels', 'edit-error'));
            return;
        }

        vcLimit = interaction.fields.getTextInputValue('edit-modal-limit-input');

        vcBitrate = interaction.fields.getTextInputValue('edit-modal-bitrate-input');

        vcName = interaction.fields.getTextInputValue('edit-modal-name-input');

        const nsfwInput = interaction.fields.getTextInputValue('edit-modal-nsfw-input');
        vcNsfw = (nsfwInput === 'true');
        edited++;
    }

    if (edited !== 0) {
        interaction.editReply(embedType(moduleConfig['channelEdited'], {}, {ephemeral: true}));
        try {
            vchann.edit({userLimit: vcLimit, nsfw: vcNsfw, name: vcName, bitrate: vcBitrate});
        } catch (e) {
            interaction.editReply(localize('temp-channels', 'edit-error'));
        }
    } else {
        interaction.editReply(localize('temp-channels', 'nothing-changed'));
    }
};

module.exports.sendMessage = async function (channel) {
    const moduleConfig = client.configurations['temp-channels']['config'];
    const components = [{
        type: 'ACTION_ROW',
        components: [
            {
                type: 'BUTTON',
                label: localize('temp-channels', 'add-user'),
                style: 'SUCCESS',
                customId: 'tempc-add',
                emoji: '➕'
            },
            {
                type: 'BUTTON',
                label: localize('temp-channels', 'remove-user'),
                style: 'DANGER',
                customId: 'tempc-remove',
                emoji: '➖'
            },
            {
                type: 'BUTTON',
                label: localize('temp-channels', 'list-users'),
                style: 'PRIMARY',
                customId: 'tempc-list',
                emoji: '📃'
            }]
    },
        {
            type: 'ACTION_ROW',
            components: [
                {
                    type: 'BUTTON',
                    label: localize('temp-channels', 'private-channel'),
                    style: 'SUCCESS',
                    customId: 'tempc-private',
                    emoji: '🔒'
                },
                {
                    type: 'BUTTON',
                    label: localize('temp-channels', 'public-channel'),
                    style: 'DANGER',
                    customId: 'tempc-public',
                    emoji: '🔓'
                },
                {
                    type: 'BUTTON',
                    label: localize('temp-channels', 'edit-channel'),
                    style: 'SECONDARY',
                    customId: 'tempc-edit',
                    emoji: '📝'
                }]
        }];
    const message = embedType(moduleConfig['settingsMessage'], {}, {components});
    channel.send(message);
};