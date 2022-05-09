const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, oldPresence, newPresence) {

    if (!client.botReadyAt) return;
    if (newPresence.member.guild.id !== client.guildID) return;
    const moduleConfig = client.configurations['status-roles']['config'];
    const roles = moduleConfig.roles;
    const status = moduleConfig.words;
    const member = newPresence.member;

    if (newPresence.activities.length > 0) {
        if (newPresence.activities[0].state) {
            if (status.some(word => newPresence.activities[0].state.toLowerCase().includes(word.toLowerCase()))) {
                if (moduleConfig.remove) await member.roles.remove(member.roles.cache.filter(role => !role.managed));
                return member.roles.add(roles, localize('status-role', 'fulfilled'));
            } else {
                removeRoles();
            }
        } else {
            removeRoles();
        }
    } else {
        removeRoles();
    }

    /**
     * Removes the roles of an user who no longer fulfills the criteria
     */
    function removeRoles() {
        for (let i = 0; i < roles.length; i++) {
            if (member.roles.cache.has(roles[i])) {
                member.roles.remove(roles[i], localize('status-role', 'not-fulfilled'));
            }
        }
    }
};
