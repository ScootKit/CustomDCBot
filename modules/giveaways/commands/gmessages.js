const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (interaction) {
    const giveaways = await interaction.client.models['giveaways']['Giveaway'].findAll({
        where: {
            ended: false,
            countMessages: true
        },
        order: [['createdAt', 'DESC']],
        limit: 15
    });
    if (giveaways.length === 0) return interaction.reply({
        ephemeral: true,
        content: ':warning: ' + localize('giveaways', 'no-giveaways-found')
    });
    let gwMessages = '';
    for (const giveaway of giveaways) {
        const channel = interaction.channel.guild.channels.cache.get(giveaway.channelID);
        if (!channel) continue;
        const message = await channel.messages.fetch(giveaway.messageID).catch(() => {
        });
        if (!message) continue;
        gwMessages = gwMessages + `[${giveaway.prize}](${message.url} "${localize('giveaways', 'jump-to-message-hover')}") in ${channel.toString()}: ${giveaway.messageCount[interaction.user.id] || 0}/${giveaway.requirements.find(r => r.type === 'messages').messageCount} ${localize('giveaways', 'messages')}`;
    }
    interaction.reply({
        ephemeral: true,
        content: `**${localize('giveaways', 'giveaway-messages')}**\n\n${gwMessages}`
    });
};

module.exports.config = {
    name: 'gmessages',
    description: localize('giveaways', 'gmessages-description'),
    defaultPermission: true
};