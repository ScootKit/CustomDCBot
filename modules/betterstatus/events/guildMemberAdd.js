const {confDir} = require('../../../main');

exports.run = async (client, member) => {
    const moduleConf = require(`${confDir}/betterstatus/config.json`);

    async function replaceMemberJoinStatusString(configElement) {
        const guild = await client.guilds.fetch(client.guildID);
        configElement = configElement.split('%tag%').join(member.user.tag);
        configElement = configElement.split('%username%').join(member.user.username);
        configElement = configElement.split('%memberCount%').join(guild.memberCount);
        return configElement;
    }

    if (moduleConf['changeOnUserJoin']) {
        await client.user.setActivity(await replaceMemberJoinStatusString(moduleConf['userJoinStatus']), {
            type: moduleConf['activityType']
        });
    }
};