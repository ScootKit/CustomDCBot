module.exports.run = async function (client, reaction, user) {
    if (!client.botReadyAt) return;
    if (reaction.partial) reaction = await reaction.fetch();
    if (reaction.message.guildId !== client.guild.id) return;

    const moduleMessages = client.configurations['reaction-roles']['messages'];
    const config = moduleMessages.find(f => f.messageID === reaction.message.id);
    if (!config) return;
    const roleContent = config.reactions[reaction['_emoji'].toString()];
    if (!roleContent) return;
    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.remove(roleContent.split(','));
};

module.exports.allowPartial = true;