const {client} = require("../../main");
const {Op} = require("sequelize");
const {embedType} = require("../../src/functions/helpers");
const {localize} = require("../../src/functions/localize");

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
        await interaction.editReply(await embedType(moduleConfig['modeSwitched'], {'%mode%': 'public'}, {ephemeral: true}));

    } else if (!publicTemp) {

        await vchann.lockPermissions;
        await vchann.permissionOverwrites.create(vchann.guild.roles.everyone, {'CONNECT': false});
        if (allowedUsers.at(0) !== '') {
            for (const user of allowedUsers) {
                await vchann.permissionOverwrites.create(interaction.guild.members.cache.get(user), {'CONNECT': true});
            }
        }
        interaction.editReply(await embedType(moduleConfig['modeSwitched'], {'%mode%': 'private'}, {ephemeral: true}));
    }

    vc.isPublic = publicTemp;
    await vc.save;
}

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
        let addedUserString = interaction.fields.getTextInputValue('add-modal-input');
        try {
            addedUser = interaction.guild.members.cache.find(member => member.user.tag === addedUserString).user;
        } catch (e) {
            try {
                addedUser = await client.users.fetch(addedUserString);
            } catch (e) {

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
    if (!await vchann.permissionsFor(vchann.guild.roles.everyone).has('CONNECT')) {
        await vchann.permissionOverwrites.create(addedUser, {'CONNECT': true});
    }
    await interaction.editReply(await embedType(moduleConfig['userAdded'], {'%user%': addedUser.tag}, {ephemeral: true}));
}

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
        let removedUserString = interaction.fields.getTextInputValue('remove-modal-input');
        try {
            removedUser = interaction.guild.members.cache.find(member => member.user.tag === removedUserString).user;
        } catch (e) {
            try {
                removedUser = await client.users.fetch(removedUserString);
            } catch (e) {

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
    interaction.editReply(await embedType(moduleConfig['userRemoved'], {'%user%': removedUser.tag}, {ephemeral: true}));
}

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
}

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
    let vcNsfw;
    let vcBitrate;
    let vcLimit;
    let vcName;

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

module.exports.sendMessage = async function (channel) {
    const moduleConfig = client.configurations['temp-channels']['config'];
    const components = [{
        type: 'ACTION_ROW',
        components: [
            {type: 'BUTTON', label: localize('temp-channels', 'add-user'), style: 'SUCCESS', customId: 'tempc-add', emoji: '➕'},
            {type: 'BUTTON', label: localize('temp-channels', 'remove-user'), style: 'DANGER', customId: 'tempc-remove', emoji: '➖'},
            {type: 'BUTTON', label: localize('temp-channels', 'list-users'), style: 'PRIMARY', customId: 'tempc-list', emoji: '📃'}]
    },
        {
            type: 'ACTION_ROW',
            components: [
                {type: 'BUTTON', label: localize('temp-channels', 'private-channel'), style: 'SUCCESS', customId: 'tempc-private', emoji: '🔓'},
                {type: 'BUTTON', label: localize('temp-channels', 'public-channel'), style: 'DANGER', customId: 'tempc-public', emoji: '🔒'},
                {type: 'BUTTON', label: localize('temp-channels', 'edit-channel'), style: 'SECONDARY', customId: 'tempc-edit', emoji: '📝'}]
        }];
    const message = embedType(moduleConfig['settingsMessage'], {}, {components});
    channel.send(message);
}