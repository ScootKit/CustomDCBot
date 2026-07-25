const {formatDiscordUserName, memberCountOrFallback} = require('../../../src/functions/helpers');
const {ActivityType} = require('discord.js');

const activityTypes = {
    'PLAYING': ActivityType.Playing,
    'STREAMING': ActivityType.Streaming,
    'WATCHING': ActivityType.Watching,
    'COMPETING': ActivityType.Competing,
    'LISTENING': ActivityType.Listening,
    'CUSTOM': ActivityType.Custom
};

module.exports.run = async function (client) {
    const moduleConf = client.configurations['betterstatus']['config'];

    await client.user.setActivity(await replaceStatusString(client.config['user_presence']), {
        type: moduleConf['activityType']
    });

    if (moduleConf.enableInterval) {
        const interval = setInterval(async () => {
            await client.user.setActivity(await replaceStatusString(moduleConf['intervalStatuses'][moduleConf['intervalStatuses'].length * Math.random() | 0]),
                {
                    type: activityTypes[moduleConf['activityType']],
                    url: (moduleConf['streamingLink'] && moduleConf.activityType === 'STREAMING') ? moduleConf['streamingLink'] : null
                });
        }, Math.min(moduleConf.interval < 5 ? 5000 : moduleConf.interval * 1000, 0x7FFFFFFF)); // At least 5 seconds to prevent rate limiting
        client.intervals.push(interval);
    }

    if (moduleConf.botStatus !== 'ONLINE') {
        await client.user.setPresence({status: moduleConf.botStatus});
    }

    if (moduleConf.activityType !== 'PLAYING' && !moduleConf.enableInterval) {
        await client.user.setActivity(client.config.user_presence, {
            type: activityTypes[moduleConf['activityType']],
            url: (moduleConf['streamingLink'] && moduleConf.activityType === 'STREAMING') ? moduleConf['streamingLink'] : null
        });
    }

    /**
     * @private
     * Replace status variables. GuildMembers and GuildPresences are both optional for this module,
     * so every placeholder derived from the member cache / presence data degrades to a placeholder
     * instead of a false count built from an empty cache.
     * @param statusString String to run the replacer on
     * @returns {Promise<String>}
     */
    async function replaceStatusString(statusString) {
        if (!statusString) return 'Invalid status';
        const members = client.guild.members.cache;
        const membersActive = (client._activeIntents || []).includes('GuildMembers');
        const presencesActive = (client._activeIntents || []).includes('GuildPresences');
        const placeholder = 'N/A';

        const random = membersActive ? members.filter(m => !m.user.bot).random() : null;

        // Needs presences too: without them every member looks offline, so this would near-always
        // fall through to the bot's own tag and read as "a member is online" when we don't know.
        const randomOnline = (membersActive && presencesActive)
            ? members.filter(m => ['online', 'dnd'].includes(m.presence?.status) && !m.user.bot).random()
            : null;

        return statusString.replaceAll('%memberCount%', memberCountOrFallback(client.guild))
            .replaceAll('%onlineMemberCount%', presencesActive ? members.filter(m => m.presence && !m.user.bot).size : placeholder)
            .replaceAll('%randomOnlineMemberTag%', randomOnline
                ? formatDiscordUserName(randomOnline.user)
                : (presencesActive ? formatDiscordUserName(client.user) : placeholder))
            .replaceAll('%randomMemberTag%', random ? `${random.user.username}#${random.user.discriminator}` : placeholder)
            .replaceAll('%channelCount%', client.guild.channels.cache.size)
            .replaceAll('%roleCount%', (await client.guild.roles.fetch()).size);
    }
};