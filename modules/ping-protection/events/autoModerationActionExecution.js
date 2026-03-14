const { processPing } = require('../ping-protection');

// Handles auto mod actions
module.exports.run = async function (client, execution) {
    if (execution.ruleTriggerType !== 1) return; 

    const config = client.configurations['ping-protection']['configuration'];
    if (config.ignoredUsers.includes(execution.userId)) return;

    const matchedKeyword = execution.matchedKeyword || "";
    const rawId = matchedKeyword.replace(/[^0-9]/g, '');
    
    let isProtected = config.protectedRoles.includes(rawId) || config.protectedUsers.includes(rawId);

    let originChannel = execution.channel;
    if (!originChannel && execution.channelId) {
        originChannel = await execution.guild.channels.fetch(execution.channelId).catch(() => null);
    }
    const memberToPunish = await execution.guild.members.fetch(execution.userId).catch(() => null);

    if (!isProtected && config.protectAllUsersWithProtectedRole) {
        try {
            const targetMember = await execution.guild.members.fetch(rawId);
            if (targetMember && targetMember.roles.cache.some(r => config.protectedRoles.includes(r.id))) {
                isProtected = true;
            }
        } catch (e) {}
    }

    if (!isProtected) return;
    if (!memberToPunish) return;

    const isRole = config.protectedRoles.includes(rawId);
    await processPing(client, execution.userId, rawId, isRole, 'Blocked by AutoMod', originChannel, memberToPunish);
};