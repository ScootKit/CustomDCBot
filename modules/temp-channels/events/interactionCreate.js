const {MessageActionRow, Modal, TextInputComponent} = require('discord.js');
const {usersList, channelMode, userAdd, userRemove, channelEdit} = require('../channel-settings');
const {localize} = require('../../../src/functions/localize');
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
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            const modal = new Modal()
                .setCustomId('tempc-add-modal')
                .setTitle(localize('temp-channels', 'add-modal-title'));
            const userInput = new TextInputComponent()
                .setCustomId('add-modal-input')
                .setLabel(localize('temp-channels', 'add-modal-prompt'))
                .setStyle('SHORT')
                .setPlaceholder('User#1234');
            const actionRow = new MessageActionRow().addComponents(userInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
        }
        if (interaction.customId === 'tempc-remove') {
            if (!vc) {
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            const modal = new Modal()
                .setCustomId('tempc-remove-modal')
                .setTitle(localize('temp-channels', 'remove-modal-title'));
            const userInput = new TextInputComponent()
                .setCustomId('remove-modal-input')
                .setLabel(localize('temp-channels', 'remove-modal-prompt'))
                .setStyle('SHORT')
                .setPlaceholder('User#1234');
            const actionRow = new MessageActionRow().addComponents(userInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
        }
        if (interaction.customId === 'tempc-list') {
            if (!vc) {
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await usersList(interaction);
        }
        if (interaction.customId === 'tempc-private') {
            if (!vc) {
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await channelMode(interaction, 'buttonPrivate');
        }
        if (interaction.customId === 'tempc-public') {
            if (!vc) {
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await channelMode(interaction, 'buttonPublic');
        }
        if (interaction.customId === 'tempc-edit') {
            if (!vc) {
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            const vchann = interaction.guild.channels.cache.get(vc.id);
            const modal = new Modal()
                .setCustomId('tempc-edit-modal')
                .setTitle(localize('temp-channels', 'edit-modal-title'));
            const nsfwInput = new TextInputComponent()
                .setCustomId('edit-modal-nsfw-input')
                .setLabel(localize('temp-channels', 'edit-modal-nsfw-prompt'))
                .setRequired(true)
                .setStyle('SHORT')
                .setPlaceholder(localize('temp-channels', 'edit-modal-nsfw-placeholder'))
                .setValue(vchann.nsfw.toString());


            const bitrateInput = new TextInputComponent()
                .setCustomId('edit-modal-bitrate-input')
                .setLabel(localize('temp-channels', 'edit-modal-bitrate-prompt'))
                .setRequired(true)
                .setStyle('SHORT')
                .setPlaceholder(localize('temp-channels', 'edit-modal-bitrate-placeholder'))
                .setValue(vchann.bitrate.toString());

            const limitInput = new TextInputComponent()
                .setCustomId('edit-modal-limit-input')
                .setLabel(localize('temp-channels', 'edit-modal-limit-prompt'))
                .setRequired(true)
                .setStyle('SHORT')
                .setPlaceholder(localize('temp-channels', 'edit-modal-limit-placeholder'))
                .setValue(vchann.userLimit.toString());

            const nameInput = new TextInputComponent()
                .setCustomId('edit-modal-name-input')
                .setLabel(localize('temp-channels', 'edit-modal-name-prompt'))
                .setRequired(true)
                .setStyle('SHORT')
                .setPlaceholder(localize('temp-channels', 'edit-modal-name-placeholder'))
                .setValue(vchann.name);

            const nsfwRow = new MessageActionRow().addComponents(nsfwInput);
            const bitrateRow = new MessageActionRow().addComponents(bitrateInput);
            const limitRow = new MessageActionRow().addComponents(limitInput);
            const nameRow = new MessageActionRow().addComponents(nameInput);
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
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await userAdd(interaction, 'modal');
        }
        if (interaction.customId === 'tempc-remove-modal') {
            if (!vc) {
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await userRemove(interaction, 'modal');
        }
        if (interaction.customId === 'tempc-edit-modal') {
            if (!vc) {
                interaction.reply({
                    ephemeral: true,
                    content: interaction.client.configurations['temp-channels']['config']['notInChannel']
                });
                return;
            }
            await interaction.deferReply({ephemeral: true});
            await channelEdit(interaction, 'modal');
        }
    }
};