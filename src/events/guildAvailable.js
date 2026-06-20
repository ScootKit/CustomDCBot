const {localize} = require('../functions/localize');

module.exports.run = async (client, guild) => {
    if (guild.id !== client.config.guildID) return;
    if (client.botReadyAt) return;
    client.logger.info(localize('main', 'home-guild-available', {g: guild.id}));
    client.guild = guild;
    client.botReadyAt = new Date();
};

module.exports.ignoreBotReadyCheck = true;
