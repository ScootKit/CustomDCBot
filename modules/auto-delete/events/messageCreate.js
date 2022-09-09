module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (!client.modules['auto-delete'].uniqueChannels) return;

    const channel = client.modules['auto-delete'].uniqueChannels.find(c => c.channelID === msg.channel.id);
    if (!channel) return;
    setTimeout(() => {
        if (msg.deletable && !msg.pinned) msg.delete().catch(() => {
        });
    }, parseFloat(channel.timeout < 2 ? 2 : channel.timeout) * 60000);
};