const {localize} = require('../../../src/functions/localize');
const {generateActionsResponse} = require('../core/panels');
const {MessageFlags} = require('discord.js');

module.exports.config = {
    name: 'View Moderation History',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['MODERATE_MEMBERS'],
    description: localize('ping-protection', 'view-moderation-history-description')
};

/*
 * Thin adapter: build the same payload the /ping-protection user actions-history slash
 * subcommand produces by reusing generateActionsResponse, then reply ephemerally with it so
 * the output (embed + pagination buttons) is identical for the targeted user.
 */
module.exports.run = async function (interaction) {
    const payload = await generateActionsResponse(interaction.client, interaction.targetUser.id, 1);
    return interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral
    });
};
