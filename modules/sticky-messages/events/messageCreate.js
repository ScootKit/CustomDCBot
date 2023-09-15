const { embedTypeV2 } = require('../../../src/functions/helpers');
const channelData = {};

/**
 * Deletes the sticky message sent by the bot
 * @param {Discord.Client} client
 * @param {Discord.Message} msg
 */
async function deleteMessage(client, msg) {
    let message;
    message = await msg.channel.messages.fetch(channelData[msg.channel.id].msg).catch(async () => {
        const msgs = await msg.channel.messages.fetch({limit: 50});
        message = msgs.find(m => m.author.id === client.user.id);
    });

    if (message) message.delete().catch(() => {});
}

/**
 * Sends the message to the channel
 * @param {Discord.Client} client
 * @param {Discord.Message} msg
 * @param {Object} configMsg The configured message
 */
async function sendMessage(client, msg, configMsg) {
    const sentMessage = await msg.channel.send(await embedTypeV2(configMsg || 'Message not found',
        {},
        {},
        []
    ));
    channelData[msg.channel.id] = {
        msg: sentMessage.id,
        timeout: null,
        time: client.uptime // Much smaller number compared to Date.now()
    };
}

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (msg.author.bot) return;

    const stickyChannels = client.configurations['sticky-messages']['channels'];
    if (!stickyChannels) return;

    const currentConfig = stickyChannels.find(c => c.channelId === msg.channel.id);
    if (!currentConfig || !currentConfig.message) return;

    if (channelData[msg.channel.id]) {
        if (channelData[msg.channel.id].time + 3000 > bot.uptime) {
            if (!channelData[msg.channel.id].timeout) channelData[msg.channel.id].timeout = setTimeout(() => {
                deleteMessage(client, msg);
                sendMessage(client, msg, currentConfig.message);
            });
            return;
        }

        deleteMessage(client, msg);
    }

    sendMessage(client, msg, currentConfig.message);
};
