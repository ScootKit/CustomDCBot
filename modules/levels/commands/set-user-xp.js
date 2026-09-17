const {localize} = require('../../../src/functions/localize');
const {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

module.exports.config = {
    name: 'Set User XP',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['ADMINISTRATOR'],
    description: localize('levels', 'set-xp-context-description')
};

module.exports.run = async function (interaction) {
    if (!interaction.client.configurations['levels']['config']['allowCheats']) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'command-disabled')
    });

    const modal = new ModalBuilder()
        .setCustomId(`set-user-xp:${interaction.targetUser.id}`)
        .setTitle(localize('levels', 'set-xp-modal-title'))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('value')
                    .setLabel(localize('levels', 'set-xp-value-label'))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );
    return interaction.showModal(modal);
};