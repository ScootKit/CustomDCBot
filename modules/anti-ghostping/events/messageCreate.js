const msgsWithMention = {};
module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.config.guildID) return;
    const moduleConfig = client.configurations['anti-ghostping']['config'];
    if (moduleConfig.ignoredChannels.includes(msg.channel.id)) return;
    let whitelisted = false;
    moduleConfig.ignoredRoles.forEach(r => {
        if (msg.member.roles.cache.get(r)) whitelisted = true;
    });
    if (whitelisted) return;
    if (moduleConfig.ignoredRoles.includes(msg.channel.id)) return;
    if (msg.mentions.members.size !== 0) msgsWithMention[msg.id] = msg;
    setTimeout(() => {
        msgsWithMention[msg.id] = null;
    }, 60000);
};
module.exports.messageWithMentions = msgsWithMention;