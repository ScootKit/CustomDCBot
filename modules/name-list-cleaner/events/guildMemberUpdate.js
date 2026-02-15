const {renameMember} = require("../renameMember");
module.exports.run = async function (client, oldGuildMember, newGuildMember) {

    if (!client.botReadyAt) return;
    if (newGuildMember.guild.id !== client.guild.id) return;
    if (oldGuildMember.nickname === newGuildMember.nickname && oldGuildMember.user.username === newGuildMember.user.username) return;
    await renameMember(client, newGuildMember);
}

