const {persistExternalEditAsBase} = require('../persistExternalEditAsBase');

module.exports.run = async function (client, oldGuildMember, newGuildMember) {
    if (!client.botReadyAt) return;
    if (newGuildMember.guild.id !== client.guild.id) return;
    if (newGuildMember.guild.ownerId === newGuildMember.id) return;

    const oldRoles = new Set(oldGuildMember.roles.cache.keys());
    const newRoles = new Set(newGuildMember.roles.cache.keys());
    const rolesChanged = oldRoles.size !== newRoles.size ||
        [...newRoles].some(r => !oldRoles.has(r));
    const nickChanged = oldGuildMember.nickname !== newGuildMember.nickname;

    if (!rolesChanged && !nickChanged) return;

    const lastRendered = client.nicknameManager.getLastRendered(newGuildMember.id);
    if (nickChanged && newGuildMember.nickname !== lastRendered) {
        await persistExternalEditAsBase(client, newGuildMember);
    }

    client.nicknameManager.attachMember(newGuildMember);
    client.nicknameManager.requestUpdate(newGuildMember.id);
};
