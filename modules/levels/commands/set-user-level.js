const {localize} = require('../../../src/functions/localize');
const {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

module.exports.config = {
    name: 'Set User Level',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['ADMINISTRATOR'],
    description: localize('levels', 'set-level-context-description')
};

module.exports.run = async function (interaction) {
    if (!interaction.client.configurations['levels']['config']['allowCheats']) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'command-disabled')
    });

    const modal = new ModalBuilder()
        .setCustomId(`set-user-level:${interaction.targetUser.id}`)
        .setTitle(localize('levels', 'set-level-modal-title'))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('value')
                    .setLabel(localize('levels', 'set-level-value-label'))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );
    return interaction.showModal(modal);
};