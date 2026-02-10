function getRewardEntries(client) {
    const rewardEntries = client.configurations?.levels?.['reward-roles'];
    return Array.isArray(rewardEntries) ? rewardEntries : [];
}

function getReplaceableRewardRoleIds(client) {
    const moduleConfig = client.configurations['levels']['config'];
    const rewardEntries = getRewardEntries(client);
    const roles = new Set();
    if (rewardEntries.length !== 0) {
        for (const entry of rewardEntries) {
            if (!entry.replacePrevious) continue;
            if (!Array.isArray(entry.roles)) continue;
            for (const roleId of entry.roles) roles.add(roleId);
        }
    } else if (moduleConfig.reward_roles) {
        for (const roleId of Object.values(moduleConfig.reward_roles)) roles.add(roleId);
    }
    return [...roles];
}

function getRewardForLevel(client, level) {
    const moduleConfig = client.configurations['levels']['config'];
    const rewardEntries = getRewardEntries(client);
    const entry = rewardEntries.find(r => parseInt(r.level) === level);
    if (entry) {
        const roles = Array.isArray(entry.roles) ? entry.roles.filter(Boolean) : [];
        if (roles.length === 0) return null;
        return {
            roles,
            replacePrevious: !!entry.replacePrevious
        };
    }
    const legacyRole = moduleConfig.reward_roles ? moduleConfig.reward_roles[level.toString()] : null;
    if (!legacyRole) return null;
    return {
        roles: [legacyRole],
        replacePrevious: !!moduleConfig.onlyTopLevelRole
    };
}

module.exports = {
    getReplaceableRewardRoleIds,
    getRewardForLevel
};
