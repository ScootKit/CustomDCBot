const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    LabelBuilder,
    UserSelectMenuBuilder
} = require('discord.js');
const {usersList, channelMode, userAdd, userRemove, channelEdit} = require('../channel-settings');
const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
const {Op} = require('sequelize');

module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    if (interaction.guild.id !== client.config.guildID) return;
    if (interaction.isButton()) {
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice.channelId},
                    {creatorID: interaction.member.id}
                ]
            }
        });


        if (interaction.customId === 'tempc-add') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('tempc-add-select')
                .setPlaceholder(localize('temp-channels', 'add-modal-prompt'))
                .setMinValues(1)
                .setMaxValues(1);
            await interaction.reply({
                ephemeral: true,
                content: localize('temp-channels', 'add-modal-prompt'),
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
            return;
        }
        if (interaction.customId === 'tempc-remove') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('tempc-remove-select')
                .setPlaceholder(localize('temp-channels', 'remove-modal-prompt'))
                .setMinValues(1)
                .setMaxValues(1);
            await interaction.reply({
                ephemeral: true,
                content: localize('temp-channels', 'remove-modal-prompt'),
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
            return;
        }
        if (interaction.customId === 'tempc-list') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await usersList(interaction);
        }
        if (interaction.customId === 'tempc-private') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await channelMode(interaction, 'buttonPrivate');
        }
        if (interaction.customId === 'tempc-public') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await channelMode(interaction, 'buttonPublic');
        }
        if (interaction.customId === 'tempc-edit') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            const vchann = interaction.guild.channels.cache.get(vc.id);
            const modal = new ModalBuilder()
                .setCustomId('tempc-edit-modal')
                .setTitle(localize('temp-channels', 'edit-modal-title'));
            const nsfwLabel = new LabelBuilder()
                .setLabel(localize('temp-channels', 'edit-modal-nsfw-prompt'))
                .setStringSelectMenuComponent(c => c
                    .setCustomId('edit-modal-nsfw-input')
                    .addOptions(
                        {
                            label: localize('temp-channels', 'edit-modal-nsfw-off'),
                            value: 'false',
                            default: vchann.nsfw === false
                        },
                        {
                            label: localize('temp-channels', 'edit-modal-nsfw-on'),
                            value: 'true',
                            default: vchann.nsfw === true
                        }
                    ));


            const bitrateLabel = new LabelBuilder()
                .setLabel(localize('temp-channels', 'edit-modal-bitrate-prompt'))
                .setStringSelectMenuComponent(c => {
                    c.setCustomId('edit-modal-bitrate-input');
                    for (const b of [8000, 16000, 32000, 64000, 96000, 128000, 256000, 384000].filter(b => b <= interaction.guild.maximumBitrate)) {
                        c.addOptions({
                            label: `${b / 1000} kbps`,
                            value: b.toString(),
                            default: vchann.bitrate === b
                        });
                    }
                    return c;
                });

            const limitInput = new TextInputBuilder()
                .setCustomId('edit-modal-limit-input')
                .setLabel(localize('temp-channels', 'edit-modal-limit-prompt'))
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(localize('temp-channels', 'edit-modal-limit-placeholder'))
                .setValue(vchann.userLimit.toString());

            const nameInput = new TextInputBuilder()
                .setCustomId('edit-modal-name-input')
                .setLabel(localize('temp-channels', 'edit-modal-name-prompt'))
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(localize('temp-channels', 'edit-modal-name-placeholder'))
                .setValue(vchann.name);

            const nsfwRow = nsfwLabel;
            const bitrateRow = bitrateLabel;
            const limitRow = new ActionRowBuilder().addComponents(limitInput);
            const nameRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(bitrateRow);
            modal.addComponents(limitRow);
            modal.addComponents(nameRow);
            modal.addComponents(nsfwRow);
            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice.channelId},
                    {creatorID: interaction.member.id}
                ]
            }
        });
        if (interaction.customId === 'tempc-add-modal') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await userAdd(interaction, 'modal');
        }
        if (interaction.customId === 'tempc-remove-modal') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await userRemove(interaction, 'modal');
        }
        if (interaction.customId === 'tempc-edit-modal') {
            if (!vc) {
                interaction.reply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await channelEdit(interaction, 'modal');
        }
    } else if (interaction.isUserSelectMenu()) {
        const vc = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.and]: [
                    {id: interaction.member.voice ? interaction.member.voice.channelId : null},
                    {creatorID: interaction.member.id}
                ]
            }
        });
        if (!vc) {
            return interaction.reply({
                ephemeral: true,
                ...embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true})
            });
        }
        if (interaction.customId === 'tempc-add-select') {
            await interaction.deferReply({ephemeral: true});
            await userAdd(interaction, 'select');
        }
        if (interaction.customId === 'tempc-remove-select') {
            await interaction.deferReply({ephemeral: true});
            await userRemove(interaction, 'select');
        }
    }
};