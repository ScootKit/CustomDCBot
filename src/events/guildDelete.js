const {localize} = require('../functions/localize');

module.exports.run = async (client, guild) => {
    if (guild.id !== client.config.guildID) return;
    client.logger.error(localize('main', 'home-guild-kicked', {g: guild.id}));

    if (client.scnxSetup) {
        await require('../functions/scnx-integration').reportIssue(client, {
            type: 'CORE_FAILURE',
            errorDescription: 'bot_not_on_guild',
            errorData: {
                inviteURL: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&guild_id=${client.config.guildID}&disable_guild_select=true&permissions=8&scope=bot%20applications.commands`
            }
        });
    } else {
        client.logger.fatal(localize('main', 'not-invited', {
            inv: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&guild_id=${client.config.guildID}&disable_guild_select=true&permissions=8&scope=bot%20applications.commands`
        }));
        return process.exit(0);
    }

    // Eager teardown so in-flight intervals/jobs stop immediately. reloadConfig() will
    // also clear these on rejoin, but we cannot wait until then.
    client.botReadyAt = null;
    client.emit('configReload');
    for (const interval of client.intervals) clearInterval(interval);
    client.intervals = [];
    for (const job of client.jobs.filter(f => f !== null)) job.cancel();
    client.jobs = [];
    client.guild = null;

    const onGuildCreate = async (newGuild) => {
        if (newGuild.id !== client.config.guildID) return;
        client.removeListener('guildCreate', onGuildCreate);
        client.logger.info(localize('main', 'home-guild-rejoined'));
        client.guild = newGuild;
        try {
            await require('../functions/configuration').reloadConfig(client);
        } catch (e) {
            client.logger.fatal(localize('main', 'config-check-failed'));
            const sentryId = client.captureException ? client.captureException(e, {source: 'guild-rejoin-reload'}) : null;
            client.logger.error(client.sanitizePath(`${e.stack || e}${sentryId ? ` [Sentry: ${sentryId}]` : ''}`));
            process.exit(0);
        }
    };
    client.on('guildCreate', onGuildCreate);
};

module.exports.ignoreBotReadyCheck = true;
