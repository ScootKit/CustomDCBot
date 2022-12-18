const {localize} = require('../../../src/functions/localize');
const {client} = require('../../../main');
const {Op} = require('sequelize');
const {channelMode, userAdd, userRemove, usersList, channelEdit} = require('../channel-settings');

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
        await channelMode(interaction, 'command');
    },
    'add-user': async function (interaction) {
        if (interaction.cancel) return;
        await userAdd(interaction, 'command');
    },
    'remove-user': async function (interaction) {
        if (interaction.cancel) return;
        await userRemove(interaction, 'command');
    },
    'list-users': async function (interaction) {
        if (interaction.cancel) return;
        await usersList(interaction, 'command');
    },
    'edit': async function (interaction) {
        if (interaction.cancel) return;
        await channelEdit(interaction, 'command');
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