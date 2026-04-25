module.exports.run = async (client, guild) => {
    if (!client.scnxSetup) return;
    if (guild.id !== client.config.guildID) return;
    client.logger.error(`Bot was removed from the configured guild (${guild.id}).`);
    await require('../functions/scnx-integration').reportIssue(client, {
        type: 'CORE_FAILURE',
        errorDescription: 'bot_not_on_guild',
        errorData: {
            inviteURL: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&guild_id=${client.config.guildID}&disable_guild_select=true&permissions=8&scope=bot%20applications.commands`
        }
    });
};

module.exports.ignoreBotReadyCheck = true;
