module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;
    const config = client.configurations['giveaways']['config'];

    if (!config.blacklist) config.blacklist = [];
    if (!config.whitelist) config.blacklist = [];
    if (!config.messageCountMode) config.messageCountMode = 'all';
    if (config.messageCountMode === 'blacklist' && config.blacklist.includes(message.channel.id)) return;
    if (config.messageCountMode === 'whitelist' && !config.whitelist.includes(message.channel.id)) return;

    const giveaways = await client.models['giveaways']['Giveaway'].findAll({
        where: {
            ended: false,
            countMessages: true
        }
    });

    for (const giveaway of giveaways) {
        if (giveaway.requirements.find(r => r.type === 'messages')) {
            const messages = giveaway.messageCount;
            giveaway.messageCount = null;
            if (!messages[message.author.id]) messages[message.author.id] = 0;
            messages[message.author.id] = (parseInt(messages[message.author.id]) + 1).toString();
            giveaway.messageCount = messages;
            await giveaway.save();
        }
    }
};