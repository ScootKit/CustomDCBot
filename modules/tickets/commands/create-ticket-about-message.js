const {localize} = require('../../../src/functions/localize');
const {createTicket} = require('../events/interactionCreate');

module.exports.config = {
    name: 'Create Ticket About Message',
    type: 'MESSAGE',
    contextMenu: true,
    description: localize('tickets', 'context-create-description')
};

module.exports.run = async function (interaction) {
    const client = interaction.client;
    const config = client.configurations['tickets']['config'];
    const element = config[0];
    if (!element) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('tickets', 'context-no-ticket-type')
    });

    const target = interaction.targetMessage;
    const quoted = target.content ? `> ${target.content.split('\n').join('\n> ')}\n` : '';
    const reference = localize('tickets', 'context-create-reference', {
        url: target.url,
        author: target.author.toString()
    }) + (quoted ? `\n${quoted}` : '');

    return createTicket(client, interaction, element, 0, reference);
};
