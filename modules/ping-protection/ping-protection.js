/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');
const { embedType, embedTypeV2, formatDate } = require('../../src/functions/helpers');
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
            createdAt: { [Op.gt]: new Date(Date.now() - duplicateWindow) }
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
            createdAt: { [Op.gt]: cutoffDate }
        }
    });
}
// Fetches ping history
async function fetchPingHistory(client, userId, page = 1, limit = 8) { 
    const offset = (page - 1) * limit;
    const { count, rows } = await client.models['ping-protection']['PingHistory'].findAndCountAll({ 
        where: { userId: userId },
        order: [['createdAt', 'DESC']], 
        limit: limit,
        offset: offset
    });
    return { total: count, history: rows };
}
// Fetches moderation history
async function fetchModHistory(client, userId, page = 1, limit = 8) {
    if (!client.models['ping-protection'] || !client.models['ping-protection']['ModerationLog']) return { total: 0, history: [] };
    try {
        const offset = (page - 1) * limit;
        const { count, rows } = await client.models['ping-protection']['ModerationLog'].findAndCountAll({
            where: { victimID: userId },
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset
        });
        return { total: count, history: rows };
    } catch (e) {
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
// Sends ping warning message
async function sendPingWarning(client, message, target, moduleConfig) {
    const warningMsg = moduleConfig.pingWarningMessage;
    if (!warningMsg) return;

    let warnMsg = { ...warningMsg };
    const placeholders = {
        '%target-name%': target.name || target.tag || target.username || 'Unknown',
        '%target-mention%': target.toString(),
        '%target-id%': target.id,
        '%pinger-id%': message.author.id
    };

    try {
        let messageOptions = await embedTypeV2(warnMsg, placeholders);
        return message.reply(messageOptions).catch(async () => {
            return message.channel.send(messageOptions).catch(() => {});
        });
    } catch (error) {
        client.logger.warn(`[Ping Protection] ${error.message}`);
    }
}

// Syncs the native AutoMod rule based on configuration
async function syncNativeAutoMod(client) {
    const config = client.configurations['ping-protection']['configuration'];
    
    try {
        const guild = await client.guilds.fetch(client.guildID);
        const rules = await guild.autoModerationRules.fetch();
        const existingRule = rules.find(r => r.name === 'Ping Protection System');

        // Logic to disable/delete the rule
        if (!config || !config.enableAutomod) {
            if (existingRule) {
                await existingRule.delete().catch(() => {});
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
                await existingRule.delete().catch(() => {});
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
        actions.push({ type: 1, metadata: blockMetadata });

        const alertChannelId = getSafeChannelId(config.autoModLogChannel);
        if (alertChannelId) {
            actions.push({
                type: 2, 
                metadata: { channel: alertChannelId }
            });
        }

        const ruleData = {
            name: 'Ping Protection System',
            eventType: 1, 
            triggerType: 1, 
            triggerMetadata: {
                keywordFilter: keywords
            },
            actions: actions,
            enabled: true,
            exemptRoles: config.ignoredRoles || [],
            exemptChannels: config.ignoredChannels || []
        };

        if (existingRule) {
            await guild.autoModerationRules.edit(existingRule.id, ruleData);
        } else {
            await guild.autoModerationRules.create(ruleData);
        }
    } catch (error) {
        client.logger.error(`[ping-protection] AutoMod Sync/Cleanup Failed: ${error.message}`);
    }
}

// Makes the history embed
async function generateHistoryResponse(client, userId, page = 1) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 8;
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
    let description = "";
    
    if (leaverData) {
        const dateStr = formatDate(leaverData.leftAt);
        const warningKey = history.length > 0 
        ? 'leaver-warning-long' 
        : 'leaver-warning-short';
        description += `⚠️ ${localize('ping-protection', warningKey, { d: dateStr })}\n\n`;
    }

    if (!isEnabled) {
        description += localize('ping-protection', 'history-disabled');
    } else if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const timeString = formatDate(entry.createdAt);
            
            let targetString = "Detected";
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
        .setColor('Orange')
        .setFooter({ 
            text: client.strings.footer, 
            iconURL: client.strings.footerImgUrl 
        });

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();
    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

// Makes the moderation actions history embed
async function generateActionsResponse(client, userId, page = 1) {
    const moderationConfig = client.configurations['ping-protection']['moderation'];
    const limit = 8;
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
    
    let description = "";

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
        ) 
        .setFooter({ 
            text: client.strings.footer, 
            iconURL: client.strings.footerImgUrl 
        });

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();
    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

// Handles data deletion
async function deleteAllUserData(client, userId) {
    await client.models['ping-protection']['PingHistory'].destroy({ 
        where: { userId: userId } 
    });
    await client.models['ping-protection']['ModerationLog'].destroy({ 
        where: { victimID: userId } 
    });
    await client.models['ping-protection']['LeaverData'].destroy({ 
        where: { userId: userId } 
    });
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
        where: { userId: userId } 
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

        if (storageConfig.DeleteAllPingHistoryAfterTimeframe) {
            const usersWithExpiredData = await client.models['ping-protection']['PingHistory'].findAll({
                where: { 
                    createdAt: { [Op.lt]: historyCutoff } 
                },
                attributes: ['userId'],
                group: ['userId']
            });

            const userIdsToWipe = usersWithExpiredData.map(entry => entry.userId);
            if (userIdsToWipe.length > 0) {
                await client.models['ping-protection']['PingHistory'].destroy({
                    where: { userId: userIdsToWipe }
                });
            }
        } 
        else {
            await client.models['ping-protection']['PingHistory'].destroy({ 
                where: { createdAt: { [Op.lt]: historyCutoff } } 
            });
        }
    }
    if (storageConfig.modLogRetention) {
        const modCutoff = new Date();
        modCutoff.setMonth(modCutoff.getMonth() - (storageConfig.modLogRetention || 12));
        await client.models['ping-protection']['ModerationLog'].destroy({ 
            where: { 
                createdAt: { [Op.lt]: modCutoff } 
            } 
        });
    }
    if (storageConfig.enableLeaverDataRetention) {
        const leaverCutoff = new Date();
        leaverCutoff.setDate(leaverCutoff.getDate() - (storageConfig.leaverRetention || 1));
        const leaversToDelete = await client.models['ping-protection']['LeaverData'].findAll({ 
            where: { 
                leftAt: { [Op.lt]: leaverCutoff } 
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
        let safeMsg = { ...logMsgConfig };

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
            await originChannel.send(messageOptions).catch(() => {});
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
        .setColor("#ed4245")
        .setFooter({ 
            text: client.strings.footer, 
            iconURL: client.strings.footerImgUrl 
        });
    if (!client.strings.disableFooterTimestamp) errorEmbed.setTimestamp();

        await originChannel.send({ embeds: [errorEmbed.toJSON()] }).catch(() => {});
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
                victimID: member.id, type, actionDuration: duration, reason
            });
        } catch (dbError) {}
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

    } 
    else if (actionType === 'KICK') {
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
        } catch (e) {}
    }

    if (!moderationRules || !Array.isArray(moderationRules) || moderationRules.length === 0) return;

    for (let i = moderationRules.length - 1; i >= 0; i--) {
        const rule = moderationRules[i];

        const retentionWeeks = storageConfig?.pingHistoryRetention || 12;
        const timeframeDays = rule.useCustomTimeframe 
        ? (rule.timeframeDays || 7) 
        : (retentionWeeks * 7);

        const pingCount = await getPingCountInWindow(client, userId, timeframeDays);
        const requiredCount =
            rule.pingsCount ??
            rule.pingsCountAdvanced ??
            rule.pingsCountBasic;
        
        // Skip this rule if no valid threshold is configured
        if (typeof requiredCount !== 'number' || !Number.isFinite(requiredCount)) {
            continue;
        }

        if (pingCount >= requiredCount) {
            const oneMinuteAgo = new Date(Date.now() - 60000);
            try {
                const recentLog = await client.models['ping-protection']['ModerationLog'].findOne({
                    where: { 
                        victimID: userId, 
                        createdAt: { [Op.gt]: oneMinuteAgo } 
                    }
                });
                if (recentLog) break;
            } catch (e) {}

            const generatedReason = rule.useCustomTimeframe 
                ? localize('ping-protection', 'reason-advanced', { 
                    c: pingCount, 
                    d: timeframeDays })
                : localize('ping-protection', 'reason-basic', { 
                    c: pingCount, 
                    w: retentionWeeks });

            if (memberToPunish) {
                const success = await executeAction(
                    client,
                    memberToPunish,
                    rule,
                    generatedReason,
                    storageConfig,
                    originChannel,
                    { pingCount, timeframeDays }
                );
                
                if (success) break;
            }
        }
    }
}

module.exports = {
    addPing,
    getPingCountInWindow,
    sendPingWarning,
    syncNativeAutoMod,
    processPing,
    fetchPingHistory,
    fetchModHistory,
    executeAction,
    deleteAllUserData,
    getLeaverStatus,
    markUserAsLeft,
    markUserAsRejoined,
    enforceRetention,
    generateHistoryResponse,
    generateActionsResponse,
    getSafeChannelId
};