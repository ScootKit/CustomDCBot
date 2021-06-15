const {confDir} = require('../../../main');

module.exports.run = async function (client) {
    const moduleConf = require(`${confDir}/betterstatus/config.json`);

    await client.user.setActivity(await replaceStatusString(client.config['user_presence']), {
        type: moduleConf['activityType']
    });

    if (moduleConf.enableInterval) {
        setInterval(async () => {
            await client.user.setActivity(await replaceStatusString(moduleConf['intervalStatuses'][moduleConf['intervalStatuses'].length * Math.random() | 0]),
                {
                    type: moduleConf['activityType']
                });
        }, moduleConf.interval < 5 ? 5000 : moduleConf.interval * 1000); // At least 5 seconds to prevent rate limiting
    }

    async function replaceStatusString(statusString) {
        const guild = await client.guilds.fetch(client.guildID);
        const members = await guild.members.fetch();
        statusString = statusString.split('%memberCount%').join(guild.memberCount);
        statusString = statusString.split('%onlineMemberCount%').join(members.filter(m => m.presence.status !== 'offline').array().length);
        const randomOnline = members.filter(m => m.presence.status !== 'offline' && !m.user.bot).random();
        statusString = statusString.split('%randomOnlineMemberTag%').join(`${randomOnline.user.username}#${randomOnline.user.discriminator}`);
        const random = members.filter(m => !m.user.bot).random();
        statusString = statusString.split('%randomMemberTag%').join(`${random.user.username}#${random.user.discriminator}`);
        statusString = statusString.split('%channelCount%').join(guild.channels.cache.array().length);
        statusString = statusString.split('%roleCount%').join((await guild.roles.fetch()).cache.array().length);
        return statusString;
    }
};