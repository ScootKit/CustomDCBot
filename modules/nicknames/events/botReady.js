const {renameMember} = require('../renameMember');

module.exports.run = async function (client) {
    console.log("EEEE")
    for (const member of client.guild.members.cache.values()) {
        await renameMember(client, member);
    }

}