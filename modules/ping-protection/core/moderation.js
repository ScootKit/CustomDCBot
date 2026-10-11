/**
 * Ping processing, punishments, and moderation logging
 * @module ping-protection
 * @author itskevinnn
 */

const {Op} = require('sequelize');
const {EmbedBuilder} = require('discord.js');
const {embedTypeV2, safeSetFooter} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {
    getSafeChannelId,
    getRequiredPingCountForMember,
    EXEMPT_THRESHOLD
} = require('./localHelpers');
const {addPing, getPingCountInWindow} = require('./records');
const {isProtectionToggledOff} = require('./toggle');

async function sendPingWarning(client, message, target, moduleConfig) {
    const warningMsg = moduleConfig.pingWarningMessage;
    if (!warningMsg) return;

    if (target.id && moduleConfig.allowProtectionToggle) {
        const isOff = await isProtectionToggledOff(client, target.id);
        if (isOff) return null;
    }

    const warnMsg = {...warningMsg};
    const placeholders = {
        '%target-name%': target.name || target.tag || target.username || 'Unknown',
        '%target-mention%': target.toString(),
        '%target-id%': target.id,
        '%pinger-id%': message.author.id
    };

    try {
        const messageOptions = await embedTypeV2(warnMsg, placeholders);
        let sentMessage = null;

        try {
            sentMessage = await message.reply(messageOptions);
        } catch (replyError) {
            client.logger.warn(localize('ping-protection', 'log-warning-reply-failed', {
                e: replyError.message
            }));

            try {
                sentMessage = await message.channel.send(messageOptions);
            } catch (sendError) {
                client.logger.warn(localize('ping-protection', 'log-warning-send-failed', {
                    c: message.channel.id,
                    e: sendError.message
                }));
                return null;
            }
        }

        if (sentMessage && moduleConfig.autoDeleteWarningMessage) {
            setTimeout(() => {
                sentMessage.delete().catch((deleteError) => {
                    client.logger.warn(localize('ping-protection', 'log-warning-delete-failed', {
                        e: deleteError.message
                    }));
                });
            }, moduleConfig.deleteWarningMessageTime * 1000);
        }

        return sentMessage;
    } catch (error) {
        client.logger.error(localize('ping-protection', 'log-warning-build-failed', {
            e: error.message
        }));
        return null;
    }
}

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
            // eslint-disable-next-line no-underscore-dangle
            if ((guild.client._activeIntents || []).includes('GuildMembers')) {
                guild.members.cache.forEach(member => {
                    if (member.roles.cache.some(r => config.protectedRoles.includes(r.id))) {
                        protectedIdsSet.add(member.id);
                    }
                });
            } else {
                client.logger.warn(localize('ping-protection', 'log-automod-role-protection-skipped'));
            }
        }

        // Exclude users who currently have their protection paused
        for (const id of protectedIdsSet) {
            if (config.allowProtectionToggle) {
                const isToggledOff = await isProtectionToggledOff(client, id);
                if (isToggledOff) continue;
            }
            keywords.push(`<@${id}>`);
            keywords.push(`<@!${id}>`);
        }

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

        const actions = [];
        const blockMetadata = {};
        if (config.autoModBlockMessage) {
            blockMetadata.customMessage = config.autoModBlockMessage;
        }
        actions.push({type: 1, metadata: blockMetadata});

        const alertChannelId = getSafeChannelId(config.autoModLogChannel);
        if (alertChannelId) {
            actions.push({type: 2, metadata: {channel: alertChannelId}});
        }

        const exactIgnoredChannels = (config.ignoredChannels || []).filter(channelId => {
            const channel = guild.channels.cache.get(channelId);
            return channel && channel.type !== 4;
        });

        const ruleData = {
            name: 'Ping Protection System',
            eventType: 1,
            triggerType: 1,
            triggerMetadata: {keywordFilter: keywords},
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

// Executes moderation action
async function executeAction(client, member, rule, reason, storageConfig, originChannel = null, stats = {}) {
    const actionType = rule.actionType;

    async function sendActionLog() {
        if (!rule.enableActionLogging || !originChannel) return;

        const logMsgConfig = rule.actionLogMessage;
        if (!logMsgConfig) return;
        const safeMsg = {...logMsgConfig};

        const placeholders = {
            '%pinger-mention%': member.toString(),
            '%pinger-name%': member.user.tag,
            '%action%': rule.actionType,
            '%duration%': rule.muteDuration || 'N/A',
            '%pings%': stats.pingCount || 'N/A',
            '%timeframe%': stats.customTimeFrame || 'N/A'
        };

        try {
            const messageOptions = await embedTypeV2(safeMsg, placeholders);
            await originChannel.send(messageOptions).catch(() => {});
        } catch (error) {
            client.logger.warn(localize('ping-protection', 'log-action-log-failed', {
                e: error.message
            }));
        }
    }

    // Sends the error message if punishment fails
    async function sendErrorLog(error) {
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
            .setColor('#ed4245');

        safeSetFooter(errorEmbed, client);
        if (!client.strings.disableFooterTimestamp) errorEmbed.setTimestamp();
        await originChannel.send({embeds: [errorEmbed.toJSON()]}).catch((sendError) => {
            client.logger.warn(localize('ping-protection', 'log-punish-log-send-failed', {
                e: sendError.message
            }));
        });
    }

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

    async function logDb(type, duration = null) {
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
    }

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
        const moduleConfig = client.configurations['ping-protection']['configuration'];

        if (moduleConfig?.kickPunishmentMessage) {
            const placeholders = {
                '%guild-name%': member.guild.name,
                '%reason%': reason,
                '%pings%': stats.pingCount || 'N/A',
                '%timeframe%': stats.customTimeFrame || stats.timeframeDays || 'N/A'
            };

            try {
                const dmPayload = await embedTypeV2(moduleConfig.kickPunishmentMessage, placeholders);
                await member.send(dmPayload);
            } catch (dmError) {
                client.logger.warn(localize('ping-protection', 'log-kick-dm-failed', {
                    u: member.user.tag,
                    e: dmError.message
                }));
            }
        }

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

// Processes a ping and applies moderation rules if thresholds are met
async function processPing(client, userId, targetId, isRole, messageUrl, originChannel, memberToPunish, pingType = 'MENTION') {
    const config = client.configurations['ping-protection']['configuration'];
    const storageConfig = client.configurations['ping-protection']['storage'];
    const moderationRules = client.configurations['ping-protection']['moderation'];

    // Stops if the user toggled their protection off
    if (!isRole && targetId && config.allowProtectionToggle) {
        const isOff = await isProtectionToggledOff(client, targetId);
        if (isOff) return;
    }

    if (storageConfig?.enablePingHistory) {
        try {
            await addPing(client, userId, messageUrl, targetId, isRole, pingType);
        } catch (e) {
            client.logger.error(localize('ping-protection', 'log-ping-history-create-failed', {
                u: userId,
                e: e.message
            }));
        }
    }

    if (!moderationRules || !Array.isArray(moderationRules) || moderationRules.length === 0) return;

    // Evaluate rules in reverse priority order (strictest first)
    for (let i = moderationRules.length - 1; i >= 0; i--) {
        const rule = moderationRules[i];
        const rulePingType = rule.pingsType || 'Both';

        if (rulePingType === 'Mentions' && pingType === 'REPLY') continue;
        if (rulePingType === 'Reply pings' && pingType === 'MENTION') continue;

        let countFilter = null;
        if (rulePingType === 'Mentions') countFilter = 'MENTION';
        else if (rulePingType === 'Reply pings') countFilter = 'REPLY';

        const retentionWeeks = storageConfig?.pingHistoryRetention || 12;
        const timeframeRaw = rule.useCustomTimeframe
            ? (rule.customTimeFrame || rule.timeframeDays || '7d')
            : (retentionWeeks * 7);

        const timeframeDisplay = String(timeframeRaw);
        const pingCount = await getPingCountInWindow(client, userId, timeframeRaw, countFilter);
        const requiredCount = getRequiredPingCountForMember(rule, memberToPunish);

        if (requiredCount === EXEMPT_THRESHOLD || typeof requiredCount !== 'number' || !Number.isFinite(requiredCount)) {
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
                if (recentLog) break; // Prevent punish spam within 60 seconds
            } catch (e) {
                client.logger.warn(localize('ping-protection', 'log-recent-mod-check-failed', {
                    u: userId,
                    e: e.message
                }));
            }

            const generatedReason = rule.useCustomTimeframe
                ? localize('ping-protection', 'reason-advanced', {c: pingCount, d: timeframeDisplay})
                : localize('ping-protection', 'reason-basic', {c: pingCount, w: retentionWeeks});

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
                        timeframeDays: timeframeDisplay,
                        customTimeFrame: timeframeDisplay
                    }
                );

                if (success) break;
            }
        }
    }
}

module.exports = {
    sendPingWarning,
    syncNativeAutoMod,
    executeAction,
    processPing
};