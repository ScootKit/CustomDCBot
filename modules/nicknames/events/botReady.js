const {renameMember} = require('../renameMember');

module.exports.run = async function (client) {
    for (const member of client.guild.members.cache.values()) {
        await renameMember(client, member);
    }
}