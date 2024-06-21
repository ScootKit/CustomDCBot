const {renameMember} = require('../renameMember');

module.exports.run = async function (client) {
    console.log("EEEE")
    for (const member of client.guild.members.cache) {
        await renameMember(client, member);
    }

}