const {balance} = require('../economy-system');

module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;

    const config = client.configurations['economy-system']['config'];

    if (config['messageDrops'] === 0) return;
    if (Math.floor(Math.random() * config['messageDrops']) !== 1) return;
    const toAdd = Math.floor(Math.random() * (interaction.config['messageDropsMax'] - interaction.config['messageDropsMin'])) + interaction.config['messageDropsMin'];
    balance(client, message.author.id, 'add', toAdd);
    client.logger.info(`[economy-system] The user ${message.author.id} gained ${toAdd} ${config['currencySymbol']} by sending a message`);
    if (client.logChannel) client.logChannel.send(`[economy-system] The user ${message.author.id} gained ${toAdd} ${config['currencySymbol']} by sending a message`);
};