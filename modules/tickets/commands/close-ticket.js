const {localize} = require('../../../src/functions/localize');
const {closeTicket} = require('../events/interactionCreate');

module.exports.config = {
    name: 'Close Ticket',
    type: 'MESSAGE',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_CHANNELS'],
    description: localize('tickets', 'context-close-description')
};

module.exports.run = async function (interaction) {
    const client = interaction.client;
    const ticket = await client.models['tickets']['Ticket'].findOne({
        where: {
            channelID: interaction.channel.id,
            open: true
        }
    });
    if (!ticket) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('tickets', 'context-not-a-ticket')
    });
    const element = client.configurations['tickets']['config'][ticket.type];
    if (!element) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('tickets', 'context-not-a-ticket')
    });
    return closeTicket(client, interaction, ticket, element);
};