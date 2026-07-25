const {localize} = require('../../../src/functions/localize');
const {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

module.exports.config = {
    name: 'Approve Suggestion',
    type: 'MESSAGE',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_MESSAGES'],
    description: localize('suggestions', 'approve-suggestion-description')
};

module.exports.run = async function (interaction) {
    const suggestion = await interaction.client.models['suggestions']['Suggestion'].findOne({
        where: {messageID: interaction.targetMessage.id}
    });
    if (!suggestion) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('suggestions', 'suggestion-not-found')
    });

    const modal = new ModalBuilder()
        .setCustomId(`suggestion-decision:approve:${suggestion.messageID}`)
        .setTitle(localize('suggestions', 'approve-suggestion-modal-title'))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('comment')
                    .setLabel(localize('suggestions', 'suggestion-decision-comment-label'))
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
            )
        );
    return interaction.showModal(modal);
};