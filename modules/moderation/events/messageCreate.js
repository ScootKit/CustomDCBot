const {moderationAction} = require('../moderationActions');
const {activateLockdown, isLockdownActive} = require('../lockdown');
const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

// Cache resolved invite codes to guild IDs to avoid repeated API calls
const inviteGuildCache = new Map();

const INVITE_PATTERN = /(?:discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/([a-zA-Z0-9-]+)/g;

function extractInviteCodes(content) {
    const codes = [];
    let match;
    while ((match = INVITE_PATTERN.exec(content)) !== null) {
        codes.push(match[1]);
    }
    INVITE_PATTERN.lastIndex = 0;
    return codes;
}

const messageCache = {};
const actionInProgress = new Set();

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (msg.author.bot) return;

    const moduleConfig = client.configurations['moderation']['config'];
    const antiSpamConfig = client.configurations['moderation']['antiSpam'];
    if (msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level2'].includes(r.id) || moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return;
    const roles = [];
    msg.member.roles.cache.filter(f => !f.managed).forEach(r => roles.push(r.id));

    // Anti-Spam
    if (antiSpamConfig.enabled) if (!antiSpamConfig.ignoredChannels.includes(msg.channel.id)) {
        let whitelisted = false;
        antiSpamConfig.ignoredRoles.forEach(r => {
            if (msg.member.roles.cache.get(r)) whitelisted = true;
        });
        if (!whitelisted) await antiSpam();
    }

    /**
     * Runs anti-spam on the message
     * @private
     * @return {Promise<void>}
     */
    async function antiSpam() {
        if (actionInProgress.has(msg.author.id)) return;
        if (!messageCache[msg.author.id]) messageCache[msg.author.id] = [];
        messageCache[msg.author.id].push({
            id: msg.id,
            content: msg.content,
            mentions: Array.from(msg.mentions.members.keys()).length !== 0,
            massMentions: msg.mentions.everyone || Array.from(msg.mentions.roles.keys()).length !== 0
        });
        setTimeout(() => {
            if (!messageCache[msg.author.id]) return;
            messageCache[msg.author.id] = messageCache[msg.author.id].filter(m => m.id !== msg.id);
            if (messageCache[msg.author.id].length === 0) delete messageCache[msg.author.id];
        }, antiSpamConfig.timeframe * 1000);
        if (messageCache[msg.author.id].length >= antiSpamConfig.maxMessagesInTimeframe) return await performAntiSpamAction(localize('moderation', 'reached-messages-in-timeframe', {
            m: antiSpamConfig.maxMessagesInTimeframe,
            t: antiSpamConfig.timeframe
        }));
        if (messageCache[msg.author.id].filter(m => m.content === msg.content).length >= antiSpamConfig.maxDuplicatedMessagesInTimeframe) return await performAntiSpamAction(localize('moderation', 'reached-duplicated-content-messages', {
            m: messageCache[msg.author.id].filter(m => m.content === msg.content).length,
            t: antiSpamConfig.timeframe
        }));
        if (messageCache[msg.author.id].filter(m => m.mentions).length >= antiSpamConfig.maxPingsInTimeframe) return await performAntiSpamAction(localize('moderation', 'reached-ping-messages', {
            m: messageCache[msg.author.id].filter(m => m.mentions).length,
            t: antiSpamConfig.timeframe
        }));
        if (messageCache[msg.author.id].filter(m => m.massMentions).length >= antiSpamConfig.maxMassPings) return await performAntiSpamAction(localize('moderation', 'reached-massping-messages', {
            m: messageCache[msg.author.id].filter(m => m.massMentions).length,
            t: antiSpamConfig.timeframe
        }));

        /**
         * Perform anti spam actions
         * @private
         * @param {String} reason Reason for executing anti spam actions
         * @return {Promise<void>}
         */
        async function performAntiSpamAction(reason) {
            actionInProgress.add(msg.author.id);
            delete messageCache[msg.author.id];
            await moderationAction(client, antiSpamConfig.action, {user: client.user}, msg.member, `[${localize('moderation', 'anti-spam')}]: ${reason}`, {roles: roles});
            if (antiSpamConfig.sendChatMessage) await msg.channel.send(embedType(antiSpamConfig.message, {
                '%reason%': reason,
                '%userid%': msg.author.id
            }));
            const lockdownConfig = client.configurations['moderation']['lockdown'];
            if (lockdownConfig && lockdownConfig.enabled && lockdownConfig.autoTriggerOnSpam && !await isLockdownActive(client)) {
                await activateLockdown(client, localize('moderation', 'lockdown-spam-trigger'), localize('moderation', 'lockdown-system'), true);
            }
            setTimeout(() => actionInProgress.delete(msg.author.id), 10000);
        }
    }

    await performBadWordAndInviteProtection(msg);
};

/**
 * Performs the bad-word and invite protection on a message
 * @private
 * @param {Message} msg Message to check
 * @return {Promise<void>}
 */
async function performBadWordAndInviteProtection(msg) {
    const moduleConfig = msg.client.configurations['moderation']['config'];
    const roles = Array.from(msg.member.roles.cache.filter(f => !f.managed).keys());
    if (msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level2'].includes(r.id) || moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return;
    let containsBlacklistedWord = false;
    moduleConfig['blacklisted_words'].forEach(word => {
        if (msg.content.toLowerCase().includes(word.toLowerCase())) containsBlacklistedWord = true;
    });
    if (containsBlacklistedWord && !msg.channel.nsfw) {
        if (moduleConfig['action_on_posting_blacklisted_word'] !== 'none') {
            await msg.delete();
            await moderationAction(msg.client, moduleConfig['action_on_posting_blacklisted_word'], msg.client, msg.member, localize('moderation', 'blacklisted-word', {c: msg.channel.toString()}), {roles});
        }
    }
    if (moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.id) || moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.parentId)) return;
    if (msg.member.roles.cache.find(r => moduleConfig['whitelisted_roles_for_invite_blocking'].includes(r.id))) return;
    if (moduleConfig['action_on_invite'] !== 'none') {
        const inviteCodes = extractInviteCodes(msg.content);
        for (const code of inviteCodes) {
            let guildId = inviteGuildCache.get(code);
            if (!guildId) {
                try {
                    const invite = await msg.client.fetchInvite(code);
                    guildId = invite.guild ? invite.guild.id : null;
                    if (guildId) {
                        if (inviteGuildCache.size > 500) {
                            const firstKey = inviteGuildCache.keys().next().value;
                            inviteGuildCache.delete(firstKey);
                        }
                        inviteGuildCache.set(code, guildId);
                    }
                } catch (e) {
                    guildId = null;
                }
            }
            if (guildId === msg.guild.id) continue;
            if (guildId && (moduleConfig['allowed_invite_guild_ids'] || []).includes(guildId)) continue;
            await msg.delete();
            await moderationAction(msg.client, moduleConfig['action_on_invite'], msg.client, msg.member, localize('moderation', 'invite-sent', {c: msg.channel.toString()}), {roles});
            return;
        }
    }
}

module.exports.performBadWordAndInviteProtection = performBadWordAndInviteProtection;