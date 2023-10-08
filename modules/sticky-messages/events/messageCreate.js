const { embedTypeV2 } = require('../../../src/functions/helpers');
const channelData = {};

/**
 * Deletes the sticky message sent by the bot
 * @param {Snowflake} clientId User ID of the bot
 * @param {Discord.TextBasedChannel} channel
 */
async function deleteMessage(clientId, channel) {
    if (!channelData[channel.id]) return;

    let message;
    message = await channel.messages.fetch(channelData[channel.id].msg).catch(async () => {
        const msgs = await channel.messages.fetch({limit: 20});
        message = msgs.find(m => m.author.id === clientId);
    });
    if (message) message.delete().catch(() => {});
}
module.exports.deleteMessage = deleteMessage;

/**
 * Sends the message to the channel
 * @param {Discord.TextBasedChannel} channel
 * @param {Object|String} configMsg The configured message
 */
async function sendMessage(channel, configMsg) {
    channelData[channel.id] = {
        msg: null,
        timeout: null,
        time: Date.now()
    };
    const sentMessage = await channel.send(await embedTypeV2(configMsg));
    channelData[channel.id] = {
        msg: sentMessage.id,
        timeout: null,
        time: Date.now()
    };
}
module.exports.sendMessage = sendMessage;

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (msg.author.id === client.user.id) return;

    const stickyChannels = client.configurations['sticky-messages']['sticky-messages'];
    if (!stickyChannels) return;

    const currentConfig = stickyChannels.find(c => c.channelId === msg.channel.id);
    if (!currentConfig || !currentConfig.message) return;
    if (!currentConfig.respondBots && msg.author.bot) return;

    if (channelData[msg.channel.id]) {
        if (channelData[msg.channel.id].time + 5000 > Date.now()) {
            if (!channelData[msg.channel.id].timeout) channelData[msg.channel.id].timeout = setTimeout(() => {
                deleteMessage(client.user.id, msg.channel);
                sendMessage(msg.channel, currentConfig.message);
            }, 5000);
            return;
        }

        deleteMessage(client.user.id, msg.channel);
        sendMessage(msg.channel, currentConfig.message);
    } else sendMessage(msg.channel, currentConfig.message);
};
