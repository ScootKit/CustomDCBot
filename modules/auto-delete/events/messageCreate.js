module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (!client.modules['auto-delete'].uniqueChannels) return;

    const channel = client.modules['auto-delete'].uniqueChannels.find(c => c.channelID === msg.channel.id);
    if (!channel) return;
    setTimeout(async () => {
        if (parseInt(channel.keepMessageCount) === 0) {
            if (msg.deletable && !msg.pinned) msg.delete().catch(() => {
            });
            return;
        }
        const oldMessages = (await msg.channel.messages.fetch({
            before: msg.id,
            limit: parseInt(channel.keepMessageCount)
        })).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
        if (oldMessages.length < parseInt(channel.keepMessageCount)) return;
        if (oldMessages.last().deletable && !oldMessages.last().pinned) await oldMessages.last().delete();
    }, parseInt(channel.timeout) * 60000);
};