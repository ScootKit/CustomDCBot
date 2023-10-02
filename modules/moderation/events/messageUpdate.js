const {performBadWordAndInviteProtection} = require('./messageCreate');

exports.run = async (client, oldMsg, msg) => {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (msg.author.bot) return;

    await performBadWordAndInviteProtection(msg);
};