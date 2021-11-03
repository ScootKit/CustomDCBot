module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;

    const config = client.configurations['economy-system']['config'];

    if (!config['messageRewards']) return;
};