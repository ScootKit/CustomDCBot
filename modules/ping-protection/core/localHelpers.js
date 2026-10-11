/**
 * Some local utility helpers
 * @module ping-protection
 * @author itskevinnn
 *
 */

const EXEMPT_THRESHOLD = 'exempt';
const PARTIAL_DELETION_COOLDOWN_HOURS = 24;
const FULL_DELETION_COOLDOWN_HOURS = 168;

// Converts human timeframes (7d etc) into ms
function parseTimeframeToMs(input, defaultDays = 7) {
    const fallbackMs = (typeof defaultDays === 'number' && Number.isFinite(defaultDays) && defaultDays > 0)
        ? defaultDays * 86400000
        : null;

    if (typeof input === 'number') {
        return Number.isFinite(input) && input > 0
            ? input * 86400000
            : fallbackMs;
    }

    const clean = String(input).trim().toLowerCase();

    // Fallback for old configs, plain numbers are treated as days
    if ((/^\d+$/).test(clean)) {
        const parsedDays = parseInt(clean, 10);
        return Number.isFinite(parsedDays) && parsedDays > 0
            ? parsedDays * 86400000
            : fallbackMs;
    }

    const match = clean.match(/^(?<value>\d+)\s*(?<unit>s|m|h|d|w)$/);
    if (!match || !match.groups) {
        return fallbackMs;
    }

    const value = parseInt(match.groups.value, 10);
    const unit = match.groups.unit;

    if (!Number.isFinite(value) || value <= 0) {
        return fallbackMs;
    }

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60000;
        case 'h': return value * 3600000;
        case 'd': return value * 86400000;
        case 'w': return value * 7 * 86400000;
        default: return fallbackMs;
    }
}

function determinePingType(message, targetId, isRole = false) {
    if (isRole || !message || !targetId) {
        return 'MENTION';
    }

    const isReply = Boolean(message.reference && message.mentions?.repliedUser?.id === targetId);
    if (!isReply) {
        return 'MENTION';
    }

    const content = message.content || '';
    if (!content) {
        return 'REPLY'; // Fallback if MessageContent intent is disabled
    }

    const hasExplicitMention = content.includes(`<@${targetId}>`) || content.includes(`<@!${targetId}>`);
    return hasExplicitMention
        ? 'MENTION'
        : 'REPLY';
}

// Satisfies Discord's snowflake requirements for channel IDs
function getSafeChannelId(configValue) {
    if (!configValue) return null;
    let rawId = null;
    if (Array.isArray(configValue) && configValue.length > 0) rawId = configValue[0];
    else if (typeof configValue === 'string') rawId = configValue;

    if (rawId && (typeof rawId === 'string' || typeof rawId === 'number')) {
        const finalId = rawId.toString();
        if (finalId.length > 5) return finalId;
    }
    return null;
}

function getWhitelistedChannelIds(channel) {
    if (!channel) return [];
    const ids = new Set();
    if (channel.id) ids.add(channel.id);
    if (channel.parentId) ids.add(channel.parentId);
    return [...ids];
}

function isWhitelistedChannel(config, channel) {
    if (!channel || !config || !Array.isArray(config.ignoredChannels) || config.ignoredChannels.length === 0) {
        return false;
    }
    const ignoredIds = new Set(config.ignoredChannels.map(id => id.toString()));
    return getWhitelistedChannelIds(channel).some(id => ignoredIds.has(id.toString()));
}

// Checks the ping count thresholds for a member based on their roles and the rule configuration
function getRequiredPingCountForMember(rule, member) {
    const baseCount =
        rule.pingsCount ??
        rule.pingsCountAdvanced ??
        rule.pingsCountBasic;

    if (typeof baseCount !== 'number' || !Number.isFinite(baseCount)) {
        return null;
    }
    if (!rule.enableRolePingThresholds) {
        return baseCount;
    }

    const thresholds = rule.rolePingThresholds;
    if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
        return baseCount;
    }
    if (!member || !member.roles?.cache) {
        return baseCount;
    }

    const matchingRoles = member.roles.cache
        .filter(role => Object.prototype.hasOwnProperty.call(thresholds, role.id))
        .sort((a, b) => b.position - a.position);

    if (matchingRoles.size === 0) {
        return baseCount;
    }

    for (const role of matchingRoles.values()) {
        const parsedValue = Number(thresholds[role.id]);
        if (!Number.isFinite(parsedValue)) continue;

        if (parsedValue === 0) {
            return EXEMPT_THRESHOLD;
        }
    }

    const highestRole = matchingRoles.first();
    const highestRoleValue = Number(thresholds[highestRole.id]);
    if (!Number.isFinite(highestRoleValue)) {
        return baseCount;
    }

    return highestRoleValue;
}

function getDeletionCooldownHours(dataType) {
    return dataType === 'del_all'
        ? FULL_DELETION_COOLDOWN_HOURS
        : PARTIAL_DELETION_COOLDOWN_HOURS;
}

function getDeletionTypeLocaleKey(dataType) {
    if (dataType === 'del_ping_history') return 'del-type-pings';
    if (dataType === 'del_moderation_history') return 'del-type-actions';
    if (dataType === 'del_all') return 'del-type-all';
    return 'del-type-unknown';
}

module.exports = {
    EXEMPT_THRESHOLD,
    PARTIAL_DELETION_COOLDOWN_HOURS,
    FULL_DELETION_COOLDOWN_HOURS,
    parseTimeframeToMs,
    determinePingType,
    getSafeChannelId,
    getWhitelistedChannelIds,
    isWhitelistedChannel,
    getRequiredPingCountForMember,
    getDeletionCooldownHours,
    getDeletionTypeLocaleKey
};