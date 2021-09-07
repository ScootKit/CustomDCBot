module.exports.run = async function (client) {
    const moduleConf = client.configurations['betterstatus']['config'];

    await client.user.setActivity(await replaceStatusString(client.config['user_presence']), {
        type: moduleConf['activityType']
    });

    if (moduleConf.enableInterval) {
        const interval = setInterval(async () => {
            await client.user.setActivity(await replaceStatusString(moduleConf['intervalStatuses'][moduleConf['intervalStatuses'].length * Math.random() | 0]),
                {
                    type: moduleConf['activityType']
                });
        }, moduleConf.interval < 5 ? 5000 : moduleConf.interval * 1000); // At least 5 seconds to prevent rate limiting
        client.intervals.push(interval);
    }

    /**
     * @private
     * Replace status variables
     * @param statusString String to run the replacer on
     * @returns {Promise<String>}
     */
    async function replaceStatusString(statusString) {
        const members = await (await client.guild.fetch()).members.fetch({withPresences: true, force: true});
        const randomOnline = members.filter(m => m.presence && !m.user.bot).random();
        const random = members.filter(m => !m.user.bot).random();
        return statusString.replaceAll('%memberCount%', client.guild.memberCount)
            .replaceAll('%onlineMemberCount%', members.filter(m => m.presence && !m.user.bot).size)
            .replaceAll('%randomOnlineMemberTag%', `${randomOnline.user.username}#${randomOnline.user.discriminator}`)
            .replaceAll('%randomMemberTag%', `${random.user.username}#${random.user.discriminator}`)
            .replaceAll('%channelCount%', client.guild.channels.cache.size)
            .replaceAll('%roleCount%', (await client.guild.roles.fetch()).size);
    }
};