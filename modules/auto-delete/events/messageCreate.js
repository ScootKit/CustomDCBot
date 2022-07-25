module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;

    const channels = client.configurations['auto-delete']['channels'];
    const channel = channels.find(c => c.channelID === msg.channel.id);
    if (!channel) return;
    setTimeout(() => {
        if (msg.deletable && !msg.pinned) msg.delete().catch(() => {
        });
    }, parseFloat(channel.timeout < 2 ? 2 : channel.timeout) * 60000);
};