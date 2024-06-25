const {renameMember} = require('../renameMember');

module.exports.run = async function (client, oldGuildMember, newGuildMember) {

    if (!client.botReadyAt) return;
    if (newGuildMember.guild.id !== client.guild.id) return;
    if (newGuildMember.nickname === oldGuildMember.nickname && newGuildMember.roles.cache.size === oldGuildMember.roles.cache.size) return;

    await renameMember(client, newGuildMember);

};
