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

module.exports.run = async (client, member) => {
    const moduleConf = client.configurations['betterstatus']['config'];

    /**
     * @private
     * Replace status variables
     * @param configElement Configuration Element
     * @returns {String}
     */
    function replaceMemberJoinStatusString(configElement) {
        return configElement.replaceAll('%tag%', formatDiscordUserName(member.user))
            .replaceAll('%username%', member.user.username)
            .replaceAll('%memberCount%', member.guild.memberCount);
    }

    if (moduleConf['changeOnUserJoin']) {
        await client.user.setActivity(replaceMemberJoinStatusString(moduleConf['userJoinStatus']), {
            type: activityTypes[moduleConf['activityType']]
        });
    }
};