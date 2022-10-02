const {embedType, disableModule, migrate} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client) {
    const moduleConfig = client.configurations['tickets']['config'];
    const messageModel = client.models['tickets']['TicketMessage'];
    await migrate('tickets', 'TicketV1', 'Ticket');
    for (const element of moduleConfig) {
        for (const element2 of moduleConfig) {
            if (moduleConfig.indexOf(element) === moduleConfig.indexOf(element2) && moduleConfig.indexOf(element) !== moduleConfig.indexOf(element2)) return disableModule('tickets', localize('tickets', 'button-not-uniqe'));
        }
        const channel = await client.channels.fetch(element['ticket-create-channel']).catch(() => {
        });
        if (!channel || channel.guild.id !== client.config.guildID || channel.type !== 'GUILD_TEXT') return disableModule('tickets', localize('tickets', 'channel-not-found', {c: element['ticket-create-channel']}));
        const components = [{
            type: 'ACTION_ROW',
            components: [{
                type: 'BUTTON',
                label: element['ticket-create-button'],
                style: 'PRIMARY',
                customId: 'create-ticket-' + moduleConfig.indexOf(element)
            }]
        }];
        const message = embedType(element['ticket-create-message'], {}, {components});

        const sent = await client.models['tickets']['TicketMessage'].findOne({
            where: {
                type: moduleConfig.indexOf(element)
            }
        });
        if (sent) {
            const channelMessages = await channel.messages.fetch(sent.messageID).catch(() => {
            });
            if (channelMessages) await channelMessages.edit(message);
            else await sendMessage(message, channel, messageModel, moduleConfig, element);
        } else {
            await sendMessage(message, channel, messageModel, moduleConfig, element);
        }
    }

};

/**
 * Send the ticket-creation-message
 * @param message the message to be sent
 * @param channel the channel it will be sent to
 * @param messageModel the model the ids of the new message and its channel will be saved to
 * @param moduleConfig needed to find the right row in the model
 * @param element needed to find the right row in the model
 * @returns {Promise<void>}
 */
async function sendMessage(message, channel, messageModel, moduleConfig, element) {
    const msg = await channel.send(message);
    const exists = await messageModel.findOne({
        where: {
            type: moduleConfig.indexOf(element)
        }
    });
    if (exists) {
        await messageModel.update({
            messageID: msg.id,
            channelID: channel.id
        }, {
            where: {
                type: moduleConfig.indexOf(element)
            }
        });
    } else {
        await messageModel.create({
            messageID: msg.id,
            channelID: channel.id,
            type: moduleConfig.indexOf(element)
        });
    }
}