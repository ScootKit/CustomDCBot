const {localize} = require("../../../src/functions/localize");

module.exports.run = async function (client, newPresence) {

    if (!client.botReadyAt) return;
    const moduleConfig = client.configurations['status-roles']['config'];
    const roles = moduleConfig.roles;
    const status = moduleConfig.words;
    const member = newPresence.member;

    if (newPresence.activities.length > 0) {
        if (status.some(word => newPresence.activities[0].state.includes(word))) {
            return member.roles.add(roles, localize('mass-role', 'fulfilled'));
        } else {
            for (let i = 0; i < roles.length; i++) {
                if (member.roles.cache.has(roles[i])) {
                    member.roles.remove(roles[i], localize('mass-role', 'not-fulfilled'));
                }
            }
        }
    }
}