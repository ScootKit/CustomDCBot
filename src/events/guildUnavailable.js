const {localize} = require('../functions/localize');

module.exports.run = async (client, guild) => {
    if (guild.id !== client.config.guildID) return;
    if (!client.botReadyAt) return;
    client.logger.warn(localize('main', 'home-guild-unavailable', {g: guild.id}));
    client.botReadyAt = null;

    if (client.scnxSetup) {
        await require('../functions/scnx-integration').reportIssue(client, {
            type: 'CORE_ISSUE',
            errorDescription: 'home_guild_unavailable'
        });
    }
};

module.exports.ignoreBotReadyCheck = true;
