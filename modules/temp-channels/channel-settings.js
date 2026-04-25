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
        await vchann.lockPermissions();
        await vchann.permissionOverwrites.create(interaction.guild.members.me, {
            'CONNECT': true,
            'VIEW_CHANNEL': true,
            'MANAGE_CHANNELS': true
        });
        await interaction.editReply(embedType(moduleConfig['modeSwitched'], {'%mode%': 'public'}, {ephemeral: true}));
    } else {
        await vchann.permissionOverwrites.create(vchann.guild.roles.everyone, {
            'CONNECT': false,
            'VIEW_CHANNEL': false
        });
        await vchann.permissionOverwrites.create(interaction.guild.members.me, {
            'CONNECT': true,
            'VIEW_CHANNEL': true
        });
        await vchann.permissionOverwrites.create(interaction.member, {
            'CONNECT': true,
            'VIEW_CHANNEL': true
        });
        if (allowedUsers.at(0) !== '') {
            for (const user of allowedUsers) {
                const member = interaction.guild.members.cache.get(user);
                if (member) await vchann.permissionOverwrites.create(member, {
                    'CONNECT': true,
                    'VIEW_CHANNEL': true
                });
            }
        }
        for (const roleId of (moduleConfig['privateBypassRoles'] || [])) {
            await vchann.permissionOverwrites.create(roleId, {
                'CONNECT': true,
                'VIEW_CHANNEL': true
            }).catch(() => {
            });
        }
        await interaction.editReply(embedType(moduleConfig['modeSwitched'], {'%mode%': 'private'}, {ephemeral: true}));
    }

    vc.isPublic = publicTemp;
    await vc.save();
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
    } else if (callerInfo === 'select') {
        addedUser = await client.users.fetch(interaction.values[0]).catch(() => null);
        if (!addedUser) return interaction.editReply(localize('temp-channels', 'user-not-found'));
    } else if (callerInfo === 'modal') {
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

    const existingUsers = (allowedUsers || '').split(',').filter(u => u.trim() !== '');
    if (existingUsers.includes(addedUser.id)) {
        await interaction.editReply(embedType(moduleConfig['userAdded'], {'%user%': formatDiscordUserName(addedUser)}, {ephemeral: true}));
        return;
    }
    existingUsers.push(addedUser.id);
    allowedUsers = existingUsers.join(',');
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
    let allowedUsers = (vc.allowedUsers || '').split(',').filter(u => u.trim() !== '');
    let removedUser = null;
    if (callerInfo === 'command') {
        removedUser = interaction.options.getUser('user');
    } else if (callerInfo === 'select') {
        removedUser = await client.users.fetch(interaction.values[0]).catch(() => null);
        if (!removedUser) return interaction.editReply(localize('temp-channels', 'user-not-found'));
    } else if (callerInfo === 'modal') {
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
        if (vc.isPublic) {
            await vchann.permissionOverwrites.delete(removedUser);
        } else {
            await vchann.permissionOverwrites.create(removedUser, {
                'CONNECT': false,
                'VIEW_CHANNEL': false
            });
        }
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
    if (!vc) {
        interaction.editReply(embedType(moduleConfig['notInChannel'], {}, {ephemeral: true}));
        return;
    }
    if (!vc.allowedUsers || vc.allowedUsers.trim() === '') {
        interaction.editReply(embedType(localize('temp-channels', 'no-added-user'), {}, {ephemeral: true}));
        return;
    }
    const allowedUsersArray = vc.allowedUsers.split(',').filter(u => u.trim() !== '');
    let allowedUsers = '';
    for (const user of allowedUsersArray) {
        allowedUsers = allowedUsers + '\n • <@' + user + '>';
    }
    if (allowedUsersArray.length === 0) {
        interaction.editReply(embedType(localize('temp-channels', 'no-added-user'), {}, {ephemeral: true}));
        return;
    }
    const listMsg = moduleConfig['listUsers'];
    const hasParam = typeof listMsg === 'string' ? listMsg.includes('%users%') : JSON.stringify(listMsg).includes('%users%');
    if (hasParam) {
        interaction.editReply(embedType(listMsg, {'%users%': allowedUsers}, {ephemeral: true}));
    } else {
        const result = embedType(listMsg, {}, {ephemeral: true});
        if (result.content) result.content += ' ' + allowedUsers;
        else if (result.embeds && result.embeds[0]) result.embeds[0].description = (result.embeds[0].description || '') + '\n' + allowedUsers;
        interaction.editReply(result);
    }
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
                interaction.editReply(embedType(moduleConfig['edit-error'], {}, {ephemeral: true}));
                return;
            }
            vcLimit = interaction.options.getInteger('user-limit');
            edited++;
        } else vcLimit = vchann.userLimit;
        if (interaction.options.getInteger('bitrate')) {
            if (interaction.options.getInteger('bitrate') <= 8000 || interaction.options.getInteger('bitrate') >= interaction.guild.maximumBitrate) {
                interaction.editReply(embedType(moduleConfig['edit-error'], {}, {ephemeral: true}));
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
            interaction.editReply(embedType(moduleConfig['edit-error'], {}, {ephemeral: true}));
            return;
        }
        if (interaction.fields.getTextInputValue('edit-modal-limit-input') < 0 || interaction.fields.getTextInputValue('edit-modal-limit-input') > 99) {
            interaction.editReply(embedType(moduleConfig['edit-error'], {}, {ephemeral: true}));
            return;
        }

        vcLimit = interaction.fields.getTextInputValue('edit-modal-limit-input');

        const bitrateValues = interaction.fields.getStringSelectValues('edit-modal-bitrate-input');
        vcBitrate = parseInt(bitrateValues[0]);

        vcName = interaction.fields.getTextInputValue('edit-modal-name-input');

        const nsfwValues = interaction.fields.getStringSelectValues('edit-modal-nsfw-input');
        vcNsfw = (nsfwValues[0] === 'true');
        edited++;
    }

    if (edited !== 0) {
        interaction.editReply(embedType(moduleConfig['channelEdited'], {}, {ephemeral: true}));
        try {
            vchann.edit({userLimit: vcLimit, nsfw: vcNsfw, name: vcName, bitrate: vcBitrate});
        } catch (e) {
            interaction.editReply(embedType(moduleConfig['edit-error'], {}, {ephemeral: true}));
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
    const messagePayload = embedType(moduleConfig['settingsMessage'], {}, {components});

    const [messageData] = await client.models['temp-channels']['SettingsMessage'].findOrCreate({
        where: {channelID: channel.id},
        defaults: {channelID: channel.id}
    });

    let message = messageData.messageID ? await channel.messages.fetch(messageData.messageID).catch(() => {
    }) : null;
    if (message) {
        await message.edit(messagePayload);
    } else {
        message = await channel.send(messagePayload);
        messageData.messageID = message.id;
        await messageData.save();
    }
};