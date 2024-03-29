const {formatDiscordUserName} = require('../../../src/functions/helpers');
exports.run = async (client, member) => {
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
            type: moduleConf['activityType']
        });
    }
};