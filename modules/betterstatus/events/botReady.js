const {formatDiscordUserName} = require('../../../src/functions/helpers');
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
        }, moduleConf.interval < 5 ? 5000 : moduleConf.interval * 1000); // At least 5 seconds to prevent rate limiting
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
     * Replace status variables
     * @param statusString String to run the replacer on
     * @returns {Promise<String>}
     */
    async function replaceStatusString(statusString) {
        if (!statusString) return 'Invalid status';
        const members = client.guild.members.cache;
        const randomOnline = members.filter(m => ['online', 'dnd'].includes(m.presence?.status) && !m.user.bot).random();
        const random = members.filter(m => !m.user.bot).random();
        return statusString.replaceAll('%memberCount%', client.guild.memberCount)
            .replaceAll('%onlineMemberCount%', members.filter(m => m.presence && !m.user.bot).size)
            .replaceAll('%randomOnlineMemberTag%', randomOnline ? formatDiscordUserName(randomOnline.user) : formatDiscordUserName(client.user))
            .replaceAll('%randomMemberTag%', `${random.user.username}#${random.user.discriminator}`)
            .replaceAll('%channelCount%', client.guild.channels.cache.size)
            .replaceAll('%roleCount%', (await client.guild.roles.fetch()).size);
    }
};