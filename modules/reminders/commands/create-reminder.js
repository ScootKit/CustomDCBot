const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

module.exports.config = {
    name: 'Create Reminder',
    type: 'MESSAGE',
    contextMenu: true,
    description: localize('reminders', 'context-create-description')
};

module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const target = interaction.targetMessage;
    const modal = new ModalBuilder()
        .setCustomId(`create-reminder:${interaction.channelId}:${target.id}`)
        .setTitle(localize('reminders', 'context-modal-title'))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('in')
                    .setLabel(localize('reminders', 'context-modal-when-label'))
                    .setPlaceholder(localize('reminders', 'context-modal-when-placeholder'))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );
    return interaction.showModal(modal);
};