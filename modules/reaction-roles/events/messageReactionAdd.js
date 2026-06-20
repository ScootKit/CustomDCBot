module.exports.run = async function (client, reaction, user) {
    if (!client.botReadyAt) return;
    if (reaction.partial) reaction = await reaction.fetch();
    if (reaction.message.guildId !== client.guild.id) return;
    if (user.id === client.user.id) return;

    const moduleMessages = client.configurations['reaction-roles']['messages'];
    const config = moduleMessages.find(f => f.messageID === reaction.message.id);
    if (!config) return;
    const roleContent = config.reactions[reaction['_emoji'].toString()];
    if (!roleContent) return;
    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.add(roleContent.split(','));
    reaction.message.react(reaction['_emoji'].toString()).then(() => {
    }).catch((e) => console.error);
};

module.exports.allowPartial = true;