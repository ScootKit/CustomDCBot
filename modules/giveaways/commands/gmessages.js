module.exports.run = async function (interaction) {
    const giveaways = await interaction.client.models['giveaways']['Giveaway'].findAll({
        where: {
            ended: false,
            countMessages: true
        },
        order: [['createdAt', 'DESC']],
        max: 15
    });
    if (giveaways.length === 0) return interaction.reply({
        ephemeral: true,
        content: '⚠ No giveaways found'
    });
    let gwMessages = '';
    for (const giveaway of giveaways) {
        const channel = interaction.channel.guild.channels.cache.get(giveaway.channelID);
        if (!channel) continue;
        const message = await channel.messages.fetch(giveaway.messageID).catch(() => {
        });
        if (!message) continue;
        gwMessages = gwMessages + `[${giveaway.prize}](${message.url} "Jump to message") in ${channel.toString()}: ${giveaway.messageCount[interaction.user.id] || 0}/${giveaway.requirements.find(r => r.type === 'messages').messageCount} Messages`;
    }
    interaction.reply({
        ephemeral: true,
        content: `**Giveaway-Messages**\n\n${gwMessages}`
    });
};

module.exports.config = {
    name: 'gmessages',
    description: 'See your messages for a giveaway',
    defaultPermission: true
};