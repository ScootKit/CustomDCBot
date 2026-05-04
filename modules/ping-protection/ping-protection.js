/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { embedType, embedTypeV2, formatDate, safeSetFooter } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');
const recentPings = new Set();

// Data handling
async function addPing(client, userId, messageUrl, targetId, isRole) {
    const config = client.configurations['ping-protection']['configuration'];
    const duplicateWindow = config.enableAutomod ? 5000 : 2000;
    const debounceKey = `${userId}_${targetId}`;

    if (recentPings.has(debounceKey)) return;
    recentPings.add(debounceKey);
    setTimeout(() => {
        recentPings.delete(debounceKey);
    }, duplicateWindow);

    const recentDuplicate = await client.models['ping-protection']['PingHistory'].findOne({
        where: {
            userId: userId,
            targetId: targetId,
            createdAt: {[Op.gt]: new Date(Date.now() - duplicateWindow)}
        }
    });

    if (recentDuplicate) return;
    await client.models['ping-protection']['PingHistory'].create({
        userId: userId,
        messageUrl: messageUrl || 'Blocked by AutoMod',
        targetId: targetId,
        isRole: isRole
    });
}

// Gets ping count in timeframe
async function getPingCountInWindow(client, userId, days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await client.models['ping-protection']['PingHistory'].count({
        where: {
            userId: userId,
            createdAt: {[Op.gt]: cutoffDate}
        }
    });
}

// Fetches ping history
async function fetchPingHistory(client, userId, page = 1, limit = 5) { 
    const offset = (page - 1) * limit;
    const {
        count,
        rows
    } = await client.models['ping-protection']['PingHistory'].findAndCountAll({
        where: {userId: userId},
        order: [['createdAt', 'DESC']],
        limit: limit,
        offset: offset
    });
    return {
        total: count,
        history: rows
    };
}

// Fetches moderation history
async function fetchModHistory(client, userId, page = 1, limit = 5) {
    if (!client.models['ping-protection'] || !client.models['ping-protection']['ModerationLog']) {
        return { total: 0, history: [] };
    }

    try {
        const offset = (page - 1) * limit;
        const {
            count,
            rows
        } = await client.models['ping-protection']['ModerationLog'].findAndCountAll({
            where: {victimID: userId},
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset
        });
        return {
            total: count,
            history: rows
        };
    } catch (e) {
        client.logger.warn(localize('ping-protection', 'log-fetch-mod-history-failed', {
            u: userId,
            e: e.message
        }));
        return { total: 0, history: [] };
    }
}

// Gets leaver status
async function getLeaverStatus(client, userId) {
    return await client.models['ping-protection']['LeaverData'].findByPk(userId);
}

// Makes sure the channel ID from config is valid for Discord
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

const EXEMPT_THRESHOLD = 'exempt';
const PARTIAL_DELETION_COOLDOWN_HOURS = 24;
const FULL_DELETION_COOLDOWN_HOURS = 168;

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

async function getDeletionCooldown(client, userId) {
    const model = client.models['ping-protection']?.['DeletionCooldown'];
    if (!model) return null;

    const cooldown = await model.findByPk(userId);
    if (!cooldown) return null;
    if (new Date(cooldown.blockedUntil) <= new Date()) {
        await cooldown.destroy().catch(() => {});
        return null;
    }

    return cooldown;
}

async function setDeletionCooldown(client, userId, dataType, deletedBy = null) {
    const model = client.models['ping-protection']?.['DeletionCooldown'];
    if (!model) return null;

    const hours = getDeletionCooldownHours(dataType);
    const blockedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await model.upsert({
        userId,
        blockedUntil,
        lastDeletionType: dataType,
        lastDeletedBy: deletedBy || null
    });

    return blockedUntil;
}

async function executeDataDeletion(client, userId, dataType) {
    const models = client.models['ping-protection'];

    if (['del_ping_history', 'del_all'].includes(dataType)) {
        await models.PingHistory.destroy({
            where: { userId }
        });
    }

    if (['del_moderation_history', 'del_all'].includes(dataType)) {
        await models.ModerationLog.destroy({
            where: { victimID: userId }
        });
    }

    if (dataType === 'del_all') {
        await models.LeaverData.destroy({
            where: { userId }
        });
    }
}

function buildPanelMenu(userId, selected = 'overview') {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`ping-protection_panel-menu_${userId}`)
        .setPlaceholder(localize('ping-protection', 'panel-ph'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-over'))
                .setValue('overview')
                .setEmoji('🏠')
                .setDefault(selected === 'overview'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-hist'))
                .setValue('history')
                .setEmoji('📜')
                .setDefault(selected === 'history'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-actions'))
                .setValue('actions')
                .setEmoji('⚠️')
                .setDefault(selected === 'actions'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-delete'))
                .setValue('deletion')
                .setEmoji('🗑️')
                .setDefault(selected === 'deletion')
        );

    return new ActionRowBuilder().addComponents(menu);
}

function buildDeletionMenu(userId) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`ping-protection_delete-menu_${userId}`)
        .setPlaceholder(localize('ping-protection', 'panel-deletion-placeholder'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-back'))
                .setValue('back')
                .setEmoji('◀️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-del-pings'))
                .setValue('del_ping_history')
                .setEmoji('📜'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-del-actions'))
                .setValue('del_moderation_history')
                .setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-del-all'))
                .setValue('del_all')
                .setEmoji('💥')
        );

    return new ActionRowBuilder().addComponents(menu);
}

async function generateUserPanel(client, targetUser) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const retentionWeeks = storageConfig?.pingHistoryRetention || 12;
    const timeframeDays = retentionWeeks * 7;

    const pingCount = await getPingCountInWindow(client, targetUser.id, timeframeDays);
    const modData = await fetchModHistory(client, targetUser.id, 1, 1);

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'panel-title', {
            u: targetUser.tag || targetUser.username
        }))
        .setDescription(localize('ping-protection', 'panel-description', {
            u: targetUser.toString(),
            i: targetUser.id
        }))
        .setColor('Blue')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields([{
            name: localize('ping-protection', 'field-quick-history', { w: retentionWeeks }),
            value: localize('ping-protection', 'field-quick-desc', {
                p: pingCount,
                m: modData.total
            }),
            inline: false
        }])

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return {
        embeds: [embed.toJSON()],
        components: [buildPanelMenu(targetUser.id, 'overview').toJSON()]
    };
}

async function generatePanelHistory(client, targetUser, page = 1) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 5;
    const isEnabled = !!storageConfig.enablePingHistory;

    let total = 0;
    let history = [];
    let totalPages = 1;

    if (isEnabled) {
        const data = await fetchPingHistory(client, targetUser.id, page, limit);
        total = data.total;
        history = data.history;
        totalPages = Math.ceil(total / limit) || 1;
    }

    const leaverData = await getLeaverStatus(client, targetUser.id);
    let description = '';

    if (leaverData) {
        const dateStr = formatDate(leaverData.leftAt);
        const warningKey = history.length > 0 ? 'leaver-warning-long' : 'leaver-warning-short';
        description += `⚠️ ${localize('ping-protection', warningKey, { d: dateStr })}\n\n`;
    }

    if (!isEnabled) {
        description += localize('ping-protection', 'history-disabled');
    } else if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const timeString = formatDate(entry.createdAt);

            let targetString = 'Detected';
            if (entry.targetId) {
                targetString = entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`;
            }

            const hasValidLink = entry.messageUrl && entry.messageUrl !== 'Blocked by AutoMod';
            const linkText = hasValidLink
                ? `[${localize('ping-protection', 'label-jump')}](${entry.messageUrl})`
                : localize('ping-protection', 'no-message-link');

            return localize('ping-protection', 'list-entry-text', {
                index: (page - 1) * limit + index + 1,
                target: targetString,
                time: timeString,
                link: linkText
            });
        });

        description += lines.join('\n\n');
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ping-protection_panel-hist_${targetUser.id}_${page - 1}`)
            .setLabel(localize('helpers', 'back'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId('ping_protection_panel_hist_count')
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`ping-protection_panel-hist_${targetUser.id}_${page + 1}`)
            .setLabel(localize('helpers', 'next'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages || !isEnabled)
    );

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'embed-history-title', {
            u: targetUser.username
        }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(description)
        .setColor('Orange')

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return {
        embeds: [embed.toJSON()],
        components: [
            buildPanelMenu(targetUser.id, 'history').toJSON(),
            row.toJSON()
        ]
    };
}

async function generatePanelActions(client, targetUser, page = 1) {
    const moderationConfig = client.configurations['ping-protection']['moderation'];
    const limit = 5;
    const isEnabled = moderationConfig && Array.isArray(moderationConfig) && moderationConfig.length > 0;

    const data = await fetchModHistory(client, targetUser.id, page, limit);
    const total = data.total;
    const history = data.history;
    const totalPages = Math.ceil(total / limit) || 1;

    let description = '';

    if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const duration = entry.actionDuration ? ` (${entry.actionDuration}m)` : '';
            const reasonText = entry.reason || localize('ping-protection', 'no-reason') || 'No reason';

            return `${(page - 1) * limit + index + 1}. **${entry.type}${duration}** - ${formatDate(entry.createdAt)}\n${localize('ping-protection', 'label-reason')}: ${reasonText}`;
        });

        description += lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ping-protection_panel-actions_${targetUser.id}_${page - 1}`)
            .setLabel(localize('helpers', 'back'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId('ping_protection_panel_actions_count')
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`ping-protection_panel-actions_${targetUser.id}_${page + 1}`)
            .setLabel(localize('helpers', 'next'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages || (!isEnabled && history.length === 0))
    );

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'embed-actions-title', {
            u: targetUser.username
        }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(description)
        .setColor(isEnabled ? 'Red' : 'Grey')

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return {
        embeds: [embed.toJSON()],
        components: [
            buildPanelMenu(targetUser.id, 'actions').toJSON(),
            row.toJSON()
        ]
    };
}

async function generatePanelDeletion(client, targetUser) {
    const cooldown = await getDeletionCooldown(client, targetUser.id);

    let description = localize('ping-protection', 'panel-deletion-desc', {
        u: targetUser.toString(),
        i: targetUser.id
    });

    if (cooldown) {
        description += `\n\n⚠️ ${localize('ping-protection', 'panel-deletion-cooldown-active', {
            time: formatDate(new Date(cooldown.blockedUntil)),
            type: localize('ping-protection', getDeletionTypeLocaleKey(cooldown.lastDeletionType))
        })}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'panel-deletion-title', {
            u: targetUser.tag || targetUser.username
        }))
        .setDescription(description)
        .setColor('DarkRed')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return {
        embeds: [embed.toJSON()],
        components: [buildDeletionMenu(targetUser.id).toJSON()]
    };
}

// Sends ping warning message
async function sendPingWarning(client, message, target, moduleConfig) {
    const warningMsg = moduleConfig.pingWarningMessage;
    if (!warningMsg) return;

    let warnMsg = {...warningMsg};
    const placeholders = {
        '%target-name%': target.name || target.tag || target.username || 'Unknown',
        '%target-mention%': target.toString(),
        '%target-id%': target.id,
        '%pinger-id%': message.author.id
    };

    try {
        const messageOptions = await embedTypeV2(warnMsg, placeholders);

        try {
            return await message.reply(messageOptions);
        } catch (replyError) {
            client.logger.warn(localize('ping-protection', 'log-warning-reply-failed', {
                e: replyError.message
            }));

            try {
                return await message.channel.send(messageOptions);
            } catch (sendError) {
                client.logger.warn(localize('ping-protection', 'log-warning-send-failed', {
                    c: message.channel.id,
                    e: sendError.message
                }));
                return null;
            }
        }
    } catch (error) {
        client.logger.warn(localize('ping-protection', 'log-warning-build-failed', {
            e: error.message
        }));
        return null;
    }
}

// Syncs the native AutoMod rule based on configuration
async function syncNativeAutoMod(client) {
    const config = client.configurations['ping-protection']['configuration'];

    try {
        const guild = await client.guilds.fetch(client.guildID);
        await guild.channels.fetch().catch((error) => {
            client.logger.warn(localize('ping-protection', 'log-automod-channel-fetch-failed', {
                e: error.message
            }));
        });
        
        const rules = await guild.autoModerationRules.fetch();
        const existingRule = rules.find(r => r.name === 'Ping Protection System');

        // Logic to disable/delete the rule
        if (!config || !config.enableAutomod) {
            if (existingRule) {
                await existingRule.delete().catch((error) => {
                    client.logger.warn(localize('ping-protection', 'log-automod-rule-delete-failed', {
                        e: error.message
                    }));
                });
            }
            return;
        }

        const keywords = [];
        if (config.protectedRoles) {
            config.protectedRoles.forEach(roleId => {
                keywords.push(`<@&${roleId}>`);
            });
        }

        const protectedIdsSet = new Set(config.protectedUsers || []);
        if (config.protectAllUsersWithProtectedRole && config.protectedRoles && config.protectedRoles.length > 0) {
            guild.members.cache.forEach(member => {
                if (member.roles.cache.some(r => config.protectedRoles.includes(r.id))) {
                    protectedIdsSet.add(member.id);
                }
            });
        }

        protectedIdsSet.forEach(id => {
            keywords.push(`<@${id}>`);
            keywords.push(`<@!${id}>`);
        });

        if (keywords.length === 0) {
            if (existingRule) {
                await existingRule.delete().catch(() => {
                });
            }
            return;
        }

        if (keywords.length > 1000) {
            client.logger.warn(localize('ping-protection', 'log-automod-keyword-limit'));
            keywords.splice(1000);
        }

        // AutoMod rule data
        const actions = [];
        const blockMetadata = {};
        if (config.autoModBlockMessage) {
            blockMetadata.customMessage = config.autoModBlockMessage;
        }
        actions.push({
            type: 1,
            metadata: blockMetadata
        });

        const alertChannelId = getSafeChannelId(config.autoModLogChannel);
        if (alertChannelId) {
            actions.push({
                type: 2,
                metadata: {channel: alertChannelId}
            });
        }

        const exactIgnoredChannels = (config.ignoredChannels || []).filter(channelId => {
            const channel = guild.channels.cache.get(channelId);
            return channel && channel.type !== 4;
        });

        const ruleData = {
            name: 'Ping Protection System',
            eventType: 1,
            triggerType: 1,
            triggerMetadata: {
                keywordFilter: keywords
            },
            actions,
            enabled: true,
            exemptRoles: config.ignoredRoles || [],
            exemptChannels: exactIgnoredChannels
        };

        if (existingRule) {
            await guild.autoModerationRules.edit(existingRule.id, ruleData);
        } else {
            await guild.autoModerationRules.create(ruleData);
        }
    } catch (error) {
        client.logger.error(localize('ping-protection', 'log-automod-sync-failed', {
            e: error.message
        }));
    }
}

// Makes the history embed
async function generateHistoryResponse(client, userId, page = 1) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 5;
    const isEnabled = !!storageConfig.enablePingHistory;

    let total = 0, history = [], totalPages = 1;

    if (isEnabled) {
        const data = await fetchPingHistory(client, userId, page, limit);
        total = data.total;
        history = data.history;
        totalPages = Math.ceil(total / limit) || 1;
    }

    const user = await client.users.fetch(userId).catch(() => ({
        username: 'Unknown User',
        displayAvatarURL: () => null
    }));

    const leaverData = await getLeaverStatus(client, userId);
    let description = '';

    if (leaverData) {
        const dateStr = formatDate(leaverData.leftAt);
        const warningKey = history.length > 0
            ? 'leaver-warning-long'
            : 'leaver-warning-short';
        description += `⚠️ ${localize('ping-protection', warningKey, {d: dateStr})}\n\n`;
    }

    if (!isEnabled) {
        description += localize('ping-protection', 'history-disabled');
    } else if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const timeString = formatDate(entry.createdAt);

            let targetString = 'Detected';
            if (entry.targetId) {
                targetString = entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`;
            }

            const hasValidLink = entry.messageUrl && entry.messageUrl !== 'Blocked by AutoMod';
            const linkText = hasValidLink
                ? `[${localize('ping-protection', 'label-jump')}](${entry.messageUrl})`
                : localize('ping-protection', 'no-message-link');

            return localize('ping-protection', 'list-entry-text', {
                index: (page - 1) * limit + index + 1,
                target: targetString,
                time: timeString,
                link: linkText
            });
        });
        description += lines.join('\n\n');
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ping-protection_hist-page_${userId}_${page - 1}`)
            .setLabel(localize('helpers', 'back'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId('ping_protection_page_count')
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`ping-protection_hist-page_${userId}_${page + 1}`)
            .setLabel(localize('helpers', 'next'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages || !isEnabled)
    );

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'embed-history-title', {
            u: user.username
        }))
        .setThumbnail(user.displayAvatarURL({
            dynamic: true
        }))
        .setDescription(description)
        .setColor('Orange');

    safeSetFooter(embed, client);

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();
    return {
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
    };
}

// Makes the moderation actions history embed
async function generateActionsResponse(client, userId, page = 1) {
    const moderationConfig = client.configurations['ping-protection']['moderation'];
    const limit = 5;
    const isEnabled = moderationConfig && Array.isArray(moderationConfig) && moderationConfig.length > 0;

    let total = 0, history = [], totalPages = 1;

    const data = await fetchModHistory(client, userId, page, limit);
    total = data.total;
    history = data.history;
    totalPages = Math.ceil(total / limit) || 1;

    const user = await client.users.fetch(userId).catch(() => ({
        username: 'Unknown User',
        displayAvatarURL: () => null
    }));

    let description = '';

    if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const duration = entry.actionDuration ? ` (${entry.actionDuration}m)` : '';
            const reasonText = entry.reason || localize('ping-protection', 'no-reason') || 'No reason';
            return `${(page - 1) * limit + index + 1}. **${entry.type}${duration}** - ${formatDate(entry.createdAt)}\n${localize('ping-protection', 'label-reason')}: ${reasonText}`;
        });
        description += lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ping-protection_mod-page_${userId}_${page - 1}`)
            .setLabel(localize('helpers', 'back'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId('ping_protection_page_count')
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`ping-protection_mod-page_${userId}_${page + 1}`)
            .setLabel(localize('helpers', 'next'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages || (!isEnabled && history.length === 0))
    );

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'embed-actions-title', {
            u: user.username
        }))
        .setThumbnail(user.displayAvatarURL({
            dynamic: true
        }))
        .setDescription(description)
        .setColor(isEnabled
            ? 'Red'
            : 'Grey'
        );

    safeSetFooter(embed, client);

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();
    return {
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
    };
}

// Handles data deletion
async function deleteAllUserData(client, userId) {
    await executeDataDeletion(client, userId, 'del_all');
    client.logger.info(localize('ping-protection', 'log-data-deletion', {
        u: userId
    }));
}

async function markUserAsLeft(client, userId) {
    await client.models['ping-protection']['LeaverData'].upsert({
        userId: userId,
        leftAt: new Date()
    });
}

async function markUserAsRejoined(client, userId) {
    await client.models['ping-protection']['LeaverData'].destroy({
        where: {userId: userId}
    });
}

// Enforces data retention
async function enforceRetention(client) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    if (!storageConfig) return;

    if (storageConfig.enablePingHistory) {
        const historyCutoff = new Date();
        const retentionWeeks = storageConfig.pingHistoryRetention || 12;
        historyCutoff.setDate(historyCutoff.getDate() - (retentionWeeks * 7));

        if (storageConfig.deleteAllPingHistoryAfterTimeframe) {
            const usersWithExpiredData = await client.models['ping-protection']['PingHistory'].findAll({
                where: {
                    createdAt: {[Op.lt]: historyCutoff}
                },
                attributes: ['userId'],
                group: ['userId']
            });

            const userIdsToWipe = usersWithExpiredData.map(entry => entry.userId);
            if (userIdsToWipe.length > 0) {
                await client.models['ping-protection']['PingHistory'].destroy({
                    where: {userId: userIdsToWipe}
                });
            }
        } else {
            await client.models['ping-protection']['PingHistory'].destroy({
                where: {createdAt: {[Op.lt]: historyCutoff}}
            });
        }
    }
    if (storageConfig.modLogRetention) {
        const modCutoff = new Date();
        modCutoff.setMonth(modCutoff.getMonth() - (storageConfig.modLogRetention || 12));
        await client.models['ping-protection']['ModerationLog'].destroy({
            where: {
                createdAt: {[Op.lt]: modCutoff}
            }
        });
    }
    if (storageConfig.enableLeaverDataRetention) {
        const leaverCutoff = new Date();
        leaverCutoff.setDate(leaverCutoff.getDate() - (storageConfig.leaverRetention || 1));
        const leaversToDelete = await client.models['ping-protection']['LeaverData'].findAll({
            where: {
                leftAt: {[Op.lt]: leaverCutoff}
            }
        });
        for (const leaver of leaversToDelete) {
            await deleteAllUserData(client, leaver.userId);
            await leaver.destroy();
        }
    }
}

// Executes moderation action
async function executeAction(client, member, rule, reason, storageConfig, originChannel = null, stats = {}) {
    const actionType = rule.actionType;

    // Sends action log if enabled
    const sendActionLog = async () => {
        if (!rule.enableActionLogging || !originChannel) return;

        const logMsgConfig = rule.actionLogMessage;
        if (!logMsgConfig) return;
        let safeMsg = {...logMsgConfig};

        const placeholders = {
            '%pinger-mention%': member.toString(),
            '%pinger-name%': member.user.tag,
            '%action%': rule.actionType,
            '%duration%': rule.muteDuration || 'N/A',
            '%pings%': stats.pingCount || 'N/A',
            '%timeframe%': stats.timeframeDays || 'N/A'
        };

        try {
            let messageOptions = await embedTypeV2(safeMsg, placeholders);
            await originChannel.send(messageOptions).catch(() => {
            });
        } catch (error) {
            client.logger.warn(localize('ping-protection', 'log-action-log-failed', {
                e: error.message
            }));
        }
    };

    // Sends error message if action fails
    const sendErrorLog = async (error) => {
    if (!originChannel) return;
        
    const errorEmbed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'punish-log-failed-title', { 
            u: member.user.tag 
        }))
        .setDescription(
            localize('ping-protection', 'punish-log-failed-desc', { 
                m: member.toString() 
            }) + 
            `\n${localize('ping-protection', 'punish-log-error', { 
                e: error.message 
            })}`
        )
        .addFields({
            name: localize('ping-protection', 'punish-log-docs-title'),
            value: localize('ping-protection', 'punish-log-docs-desc'),
            inline: false
        })
        .setColor('#ed4245')
    
        safeSetFooter(errorEmbed, client);
        if (!client.strings.disableFooterTimestamp) errorEmbed.setTimestamp();
        await originChannel.send({ embeds: [errorEmbed.toJSON()] }).catch((sendError) => {
            client.logger.warn(localize('ping-protection', 'log-punish-log-send-failed', {
                e: sendError.message
            }));
        });
    };

    if (!member) {
        client.logger.debug(localize('ping-protection', 'log-not-a-member'));
        return false;
    }

    const botMember = await member.guild.members.fetch(client.user.id);
    if (botMember.roles.highest.position <= member.roles.highest.position) {
        await sendErrorLog({
            message: localize('ping-protection', 'punish-role-error', {
                tag: member.user.tag
            })
        });
        client.logger.warn(localize('ping-protection', 'log-punish-role-error', {
            tag: member.user.tag
        }));
        return false;
    }

    const logDb = async (type, duration = null) => {
        try {
            await client.models['ping-protection']['ModerationLog'].create({
                victimID: member.id,
                type,
                actionDuration: duration,
                reason
            });
        } catch (dbError) {
            client.logger.error(localize('ping-protection', 'log-modlog-create-failed', {
                u: member.id,
                e: dbError.message
            }));
        }
    };

    if (actionType === 'MUTE') {
        const durationMs = rule.muteDuration * 60000;
        await logDb('MUTE', rule.muteDuration);
        try {
            await member.timeout(durationMs, reason);
            await sendActionLog();
            return true;
        } catch (error) {
            await sendErrorLog(error);
            client.logger.warn(localize('ping-protection', 'log-mute-error', {
                tag: member.user.tag,
                e: error.message
            }));
            return false;
        }

    } else if (actionType === 'KICK') {
        await logDb('KICK');
        try {
            await member.kick(reason);
            await sendActionLog();
            return true;
        } catch (error) {
            await sendErrorLog(error);
            client.logger.warn(localize('ping-protection', 'log-kick-error', {
                tag: member.user.tag,
                e: error.message
            }));
            return false;
        }
    }
    return false;
}

// Processes a ping event
async function processPing(client, userId, targetId, isRole, messageUrl, originChannel, memberToPunish) {
    const config = client.configurations['ping-protection']['configuration'];
    const storageConfig = client.configurations['ping-protection']['storage'];
    const moderationRules = client.configurations['ping-protection']['moderation'];

    if (storageConfig?.enablePingHistory) {
        try {
            await addPing(client, userId, messageUrl, targetId, isRole);
        } catch (e) {
            client.logger.error(localize('ping-protection', 'log-ping-history-create-failed', {
                u: userId,
                e: e.message
            }));
        }
    }

    if (!moderationRules || !Array.isArray(moderationRules) || moderationRules.length === 0) return;

    for (let i = moderationRules.length - 1; i >= 0; i--) {
        const rule = moderationRules[i];

        const retentionWeeks = storageConfig?.pingHistoryRetention || 12;
        const timeframeDays = rule.useCustomTimeframe
            ? (rule.timeframeDays || 7)
            : (retentionWeeks * 7);

        const pingCount = await getPingCountInWindow(client, userId, timeframeDays);
        const requiredCount = getRequiredPingCountForMember(rule, memberToPunish);

        if (requiredCount === EXEMPT_THRESHOLD) {
            continue;
        }

        if (typeof requiredCount !== 'number' || !Number.isFinite(requiredCount)) {
            continue;
        }

        if (pingCount >= requiredCount) {
            const oneMinuteAgo = new Date(Date.now() - 60000);
            try {
                const recentLog = await client.models['ping-protection']['ModerationLog'].findOne({
                    where: {
                        victimID: userId,
                        createdAt: {[Op.gt]: oneMinuteAgo}
                    }
                });
                if (recentLog) break;
            } catch (e) {
                client.logger.warn(localize('ping-protection', 'log-recent-mod-check-failed', {
                    u: userId,
                    e: e.message
                }));
            }

            const generatedReason = rule.useCustomTimeframe
                ? localize('ping-protection', 'reason-advanced', {
                    c: pingCount,
                    d: timeframeDays
                })
                : localize('ping-protection', 'reason-basic', {
                    c: pingCount,
                    w: retentionWeeks
                });

            if (memberToPunish) {
                const success = await executeAction(
                    client,
                    memberToPunish,
                    rule,
                    generatedReason,
                    storageConfig,
                    originChannel,
                    {
                        pingCount,
                        timeframeDays
                    }
                );

                if (success) break;
            }
        }
    }
}

module.exports = {
    addPing,
    getPingCountInWindow,
    getSafeChannelId,
    isWhitelistedChannel,
    getRequiredPingCountForMember,
    EXEMPT_THRESHOLD,
    sendPingWarning,
    syncNativeAutoMod,
    processPing,
    fetchPingHistory,
    fetchModHistory,
    executeAction,
    deleteAllUserData,
    executeDataDeletion,
    getDeletionCooldown,
    setDeletionCooldown,
    getDeletionTypeLocaleKey,
    getLeaverStatus,
    markUserAsLeft,
    markUserAsRejoined,
    enforceRetention,
    generateHistoryResponse,
    generateActionsResponse,
    generateUserPanel,
    generatePanelHistory,
    generatePanelActions,
    generatePanelDeletion
};