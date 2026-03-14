const {localize} = require('../../../src/functions/localize');
const {ActivityType} = require('discord.js');

module.exports.run = async function (client, oldPresence, newPresence) {
    if (!client.botReadyAt) return;
    if (newPresence.member.guild.id !== client.guildID) return;
    const moduleConfig = client.configurations['status-roles']['config'];
    const roles = moduleConfig.roles;
    const status = moduleConfig.words;

    if (status.some(word => newPresence.activities.filter(f => f.type === ActivityType.Custom).some(a => a.state && a.state.toLowerCase().includes(word.toLowerCase())))) {
        if (newPresence.member.roles.cache.filter(f => roles.includes(f.id)).size === roles.length) return;
        if (moduleConfig.remove) await newPresence.member.roles.remove(newPresence.member.roles.cache.filter(role => !role.managed));
        return newPresence.member.roles.add(roles, localize('status-role', 'fulfilled'));
    } else {
        if (newPresence.status === 'offline' && moduleConfig.ignoreOfflineUsers) return;
        await removeRoles();
    }

    /**
     * Removes the roles of a user who no longer fulfills the criteria
     */
    async function removeRoles() {
        if (newPresence.member.roles.cache.filter(f => roles.includes(f.id)).size === 0) return;
        await newPresence.member.roles.remove(roles, localize('status-role', 'not-fulfilled'));
    }
};