const {moderationAction} = require('../moderationActions');
const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const stopPhishing = require('stop-discord-phishing');

const messageCache = {};

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
    msg.member.roles.cache.forEach(r => roles.push(r.id));

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
        if (!messageCache[msg.author.id]) messageCache[msg.author.id] = [];
        messageCache[msg.author.id].push({
            id: msg.id,
            content: msg.content,
            mentions: Array.from(msg.mentions.members.keys()).length !== 0,
            massMentions: msg.mentions.everyone || Array.from(msg.mentions.roles.keys()).length !== 0
        });
        setTimeout(() => {
            messageCache[msg.author.id] = messageCache[msg.author.id].filter(m => m.id !== msg.id);
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
            await moderationAction(client, antiSpamConfig.action, {user: client.user}, msg.member, `[${localize('moderation', 'anti-spam')}]: ${reason}`, {roles: roles});
            if (antiSpamConfig.sendChatMessage) await msg.channel.send(embedType(antiSpamConfig.message, {
                '%reason%': reason,
                '%userid%': msg.author.id
            }));
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
    if (msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level2'].includes(r.id) || moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return;
    if (moduleConfig['action_on_scam_link'] !== 'none') {
        if (await stopPhishing.checkMessage(msg.content, moduleConfig['action_on_scam_link'] === 'suspicious')) {
            await msg.delete();
            await moderationAction(msg.client, moduleConfig['action_on_scam_link'], msg.client, msg.member, localize('moderation', 'scam-url-sent', {c: msg.channel.toString()}), {roles: msg.member.roles.cache.keys()});
            return;
        }
    }
    let containsBlacklistedWord = false;
    moduleConfig['blacklisted_words'].forEach(word => {
        if (msg.content.toLowerCase().includes(word.toLowerCase())) containsBlacklistedWord = true;
    });
    if (containsBlacklistedWord && !msg.channel.nsfw) {
        if (moduleConfig['action_on_posting_blacklisted_word'] !== 'none') {
            await msg.delete();
            await moderationAction(msg.client, moduleConfig['action_on_posting_blacklisted_word'], msg.client, msg.member, localize('moderation', 'blacklisted-word', {c: msg.channel.toString()}), {roles: msg.member.roles.cache.keys()});
        }
    }
    if (moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.id) || moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.parentId)) return;
    if (msg.member.roles.cache.find(r => moduleConfig['whitelisted_roles_for_invite_blocking'].includes(r.id))) return;
    if (moduleConfig['action_on_invite'] !== 'none') {
        if (msg.content.includes('discord.gg/') || msg.content.includes('discordapp.com/invite/')) {
            await msg.delete();
            await moderationAction(msg.client, moduleConfig['action_on_invite'], msg.client, msg.member, localize('moderation', 'invite-sent', {c: msg.channel.toString()}), {roles: msg.member.roles.cache.keys()});
        }
    }
}

module.exports.performBadWordAndInviteProtection = performBadWordAndInviteProtection;