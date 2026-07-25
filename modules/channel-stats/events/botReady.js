const {ChannelType} = require('discord.js');
const {formatDate, memberCountOrFallback, onlineCountOrNull} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async (client) => {
    const channels = client.configurations['channel-stats']['channels'];
    for (const channel of channels) {
        const dcChannel = await client.channels.fetch(channel.channelID).catch(() => {
        });
        if (!dcChannel) continue;
        if (dcChannel.type !== ChannelType.GuildVoice && dcChannel.type !== ChannelType.GuildCategory) client.logger.warn(`[channel-stats] ` + localize('channel-stats', 'not-voice-channel-info', {
            c: dcChannel.name,
            id: dcChannel.id,
            t: dcChannel.type
        }));
        const res = await channelNameReplacer(client, dcChannel, channel.channelName);
        if (res !== dcChannel.name) await dcChannel.setName(res, '[channel-stats] ' + localize('channel-stats', 'audit-log-reason-startup')).catch(() => {
        });
        let updating = false;
        client.intervals.push(setInterval(async () => {
            if (updating) return;
            updating = true;
            try {
                const repName = await channelNameReplacer(client, dcChannel, channel.channelName);
                if (repName !== dcChannel.name) await dcChannel.setName(repName, '[channel-stats] ' + localize('channel-stats', 'audit-log-reason-interval')).catch(() => {
                });
            } finally {
                updating = false;
            }
        }, Math.min(((channel.updateInterval || 5) < 5 ? 5 : (channel.updateInterval || 5)) * 60000, 0x7FFFFFFF)));
    }
};

/**
 * Replaces the variables in channel names
 * @private
 * @param {Client} client Client
 * @param {Channel} channel Channel
 * @param {String} input Input to be replaced
 * @return {Promise<string>}
 */
async function channelNameReplacer(client, channel, input) {
    const users = client.guild.members.cache;
    const members = users.filter(u => !u.user.bot);

    // Presence data is only reliable with GuildPresences; role membership and the non-bot subset
    // are enumerated from the member cache, which is near-empty without GuildMembers. Both degrade
    // to a placeholder rather than silently under-reporting.
    const presencesActive = (client._activeIntents || []).includes('GuildPresences');
    const membersActive = (client._activeIntents || []).includes('GuildMembers');
    const presencePlaceholder = 'N/A';

    /**
     * Replaces the first member-with-role-count parameters of the input
     * @private
     */
    function replaceFirst() {
        if (input.includes('%userWithRoleCount-')) {
            const id = input.split('%userWithRoleCount-')[1].split('%')[0];
            if (input.includes(`%userWithRoleCount-${id}%`)) {
                input = input.replaceAll(`%userWithRoleCount-${id}%`, membersActive ? users.filter(f => f.roles.cache.has(id)).size.toString() : presencePlaceholder);
                replaceFirst();
            }
        }
        if (input.includes('%onlineUserWithRoleCount-')) {
            const id = input.split('%onlineUserWithRoleCount-')[1].split('%')[0];
            if (input.includes(`%onlineUserWithRoleCount-${id}%`)) {
                input = input.replaceAll(`%onlineUserWithRoleCount-${id}%`, (membersActive && presencesActive) ? users.filter(f => f.roles.cache.has(id) && f.presence && (f.presence || {}).status !== 'offline').size.toString() : presencePlaceholder);
                replaceFirst();
            }
        }
    }

    replaceFirst();
    const onlineUserCount = onlineCountOrNull(client, client.guild);
    return input.split('%userCount%').join(memberCountOrFallback(client.guild))
        .split('%memberCount%').join(membersActive ? members.size : presencePlaceholder)
        .split('%onlineUserCount%').join(onlineUserCount === null ? presencePlaceholder : onlineUserCount)
        .split('%onlineMemberCount%').join(presencesActive ? members.filter(u => u.presence && (u.presence || {}).status !== 'offline').size : presencePlaceholder)
        .split('%channelCount%').join(channel.guild.channels.cache.size)
        .split('%roleCount%').join(channel.guild.roles.cache.size)
        .split('%botCount%').join(membersActive ? users.filter(m => m.user.bot).size : presencePlaceholder)
        .split('%dndCount%').join(presencesActive ? members.filter(u => u.presence && (u.presence || {}).status === 'dnd').size : presencePlaceholder)
        .split('%awayCount%').join(presencesActive ? members.filter(m => m.presence && (m.presence || {}).status === 'idle').size : presencePlaceholder)
        .split('%offlineCount%').join(presencesActive ? members.filter(m => !m.presence || (m.presence || {}).status === 'offline').size : presencePlaceholder)
        .split('%guildBoosts%').join(channel.guild.premiumSubscriptionCount || '0')
        .split('%boostLevel%').join(localize('boostTier', channel.guild.premiumTier))
        .split('%boosterCount%').join(members.filter(m => !!m.premiumSinceTimestamp).size)
        .split('%emojiCount%').join(channel.guild.emojis.cache.size)
        .split('%currentTime%').join(formatDate(new Date(), true)).trim();
}

module.exports.channelNameReplacer = channelNameReplacer;
