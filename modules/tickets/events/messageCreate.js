module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    const ticketChannel = await client.models['tickets']['Ticket'].findOne({
        where: {
            channelID: msg.channel.id,
            open: true
        }
    });
    if (!ticketChannel) return;
    ticketChannel.msgCount++;
    await ticketChannel.save();
};