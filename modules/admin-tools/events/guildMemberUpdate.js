const {createTemporaryRoleChangeAction} = require('../temporaryRoles');
const durationParser = require('parse-duration');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, oldMember, newMember) {
    if (!client.botReadyAt) return;
    if (newMember.guild.id !== client.guild.id) return;

    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    if (addedRoles.size === 0) return;

    await handleRoleBans(client, newMember);
    await handleAlwaysTemporaryRoles(client, newMember, addedRoles);
};

async function handleRoleBans(client, newMember) {
    const config = client.configurations['admin-tools']['role-bans'];
    if (!config || !Array.isArray(config) || config.length === 0) return;

    if (newMember.permissions.has('ManageRoles')) return;

    for (const role of newMember.roles.cache.values()) {
        const entry = config.find(c => c.roleID === role.id);
        if (!entry) continue;

        const deleteMessageSeconds = Math.min(Math.max((entry.deleteMessageDays || 0), 0), 7) * 86400;
        await newMember.ban({
            deleteMessageSeconds,
            reason: localize('admin-tools', 'audit-log-role-ban', {r: role.name, reason: entry.reason || ''})
        });
        return;
    }
}

async function handleAlwaysTemporaryRoles(client, newMember, addedRoles) {
    const config = client.configurations['admin-tools']['always-temporary-roles'];
    if (!config || !Array.isArray(config) || config.length === 0) return;

    for (const role of addedRoles.values()) {
        const entry = config.find(c => c.roleID === role.id);
        if (!entry) continue;

        const ms = durationParser(entry.duration);
        if (!ms || ms < 20000) continue;

        const removeDate = new Date(Date.now() + ms);
        await createTemporaryRoleChangeAction(client, 'remove', removeDate, role.id, newMember.id);
    }
}
