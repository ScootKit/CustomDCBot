const {scheduleJob} = require('node-schedule');
const {embedType, formatDate, dateToDiscordTimestamp, formatDiscordUserName} = require('../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../src/functions/localize');
const durationParser = require('parse-duration');
const {Op} = require('sequelize');
const {getLinkedGroup} = require('./linkedAccounts');

/**
 * Performs a mod action
 * @param {Client} client Client
 * @param {String} type Typ of action to run
 * @param {User} user User who run this action
 * @param {Member} victim Member on who this action should get executed
 * @param {String} reason Reason for this action
 * @param {Object} additionalData Additional data needed for executing this action
 * @param {Date} expiringAt Date when this action should expire
 * @param {MessageAttachment} proof Message-Attachment containing proof
 * @return {Promise<unknown>}
 */
async function moderationAction(client, type, user, victim, reason, additionalData = {}, expiringAt = null, proof = null, options = {}) {
    const moduleConfig = client.configurations['moderation']['config'];
    const moduleStrings = client.configurations['moderation']['strings'];
    const antiGriefConfig = client.configurations['moderation']['antiGrief'];
    if (!reason) reason = localize('moderation', 'no-reason');
    return new Promise(async (resolve, reject) => {
        try {
        const guild = await client.guilds.fetch(client.guildID);
        const now = new Date();
        let activeAction = null;
        if (expiringAt && victim && victim.id) {
            activeAction = await client.models['moderation']['ModerationAction'].findOne({
                where: {
                    victimID: victim.id,
                    type,
                    expiresOn: {
                        [Op.gt]: now
                    }
                },
                order: [['createdAt', 'DESC']]
            });
            if (activeAction) {
                const undone = await client.models['moderation']['ModerationAction'].findOne({
                    where: {
                        victimID: victim.id,
                        type: 'un' + type,
                        createdAt: {
                            [Op.gte]: activeAction.createdAt
                        }
                    }
                });
                if (undone) activeAction = null;
            }
        }
        if (activeAction && expiringAt && activeAction.expiresOn) {
            const extendMs = expiringAt.getTime() - now.getTime();
            if (extendMs > 0) expiringAt = new Date(new Date(activeAction.expiresOn).getTime() + extendMs);
            if (type === 'quarantine') {
                const savedRoles = (activeAction.additionalData || {}).roles;
                if (savedRoles instanceof Array) additionalData = {...additionalData, roles: savedRoles};
            }
        }
        const quarantineRole = await guild.roles.fetch(moduleConfig['quarantine-role-id']).catch(() => {
        });
        if (!quarantineRole && (type === 'quarantine' || type === 'unquarantine')) {
            client.logger.error(localize('moderation', 'quarantinerole-not-found'));
            return reject(localize('moderation', 'quarantinerole-not-found'));
        }
        if (antiGriefConfig['enabled'] && ['warn', 'mute', 'kick', 'ban'].includes(type)) {
            const affectedActions = await client.models['moderation']['ModerationAction'].findAll({
                where: {
                    createdAt: {
                        [Op.gte]: new Date(new Date().getTime() - parseInt(antiGriefConfig['timeframe']) * 3600000)
                    },
                    type
                }
            });
            if ((affectedActions.length + 1) > parseInt(antiGriefConfig[`max_${type}`])) {
                await moderationAction(client, 'quarantine', {user: client.user}, user, '[ANTI-GRIEF] ' + localize('moderation', 'anti-grief-reason', {
                    type,
                    n: antiGriefConfig[`max_${type}`],
                    h: antiGriefConfig['timeframe']
                }));
                return reject(localize('moderation', 'anti-grief-user-message'));
            }
        }
        switch (type) {
            case 'mute':
                if (!expiringAt) expiringAt = new Date(new Date().getTime() + 1209600000);
                await victim.timeout(expiringAt.getTime() - new Date().getTime(), localize('moderation', 'mute-audit-log-reason', {
                    u: formatDiscordUserName(user.user),
                    r: reason
                }));
                sendMessage(victim, embedType(expiringAt ? moduleStrings['tmpmute_message'] : moduleStrings['mute_message'], {
                    '%reason%': reason,
                    '%user%': formatDiscordUserName(user.user),
                    '%date%': expiringAt ? formatDate(expiringAt) : null
                }));
                if (moduleConfig['changeNicknames']) await victim.setNickname(moduleConfig['changeNicknameOnMute'].split('%nickname%').join(victim.nickname ? victim.nickname : victim.user.username), '[moderation] ' + localize('moderation', 'mute-audit-log-reason', {
                    u: formatDiscordUserName(user.user),
                    r: reason
                })).catch(() => {
                });
                break;
            case 'unmute':
                if (victim.isCommunicationDisabled()) await victim.timeout(null, localize('moderation', 'unmute-audit-log-reason', {
                    u: formatDiscordUserName(user.user),
                    r: reason
                }));
                sendMessage(victim, embedType(moduleStrings['unmute_message'], {
                    '%reason%': reason,
                    '%user%': formatDiscordUserName(user.user)
                }));
                if (moduleConfig['changeNicknames']) await victim.setNickname(victim.user.username, '[moderation] ' + localize('moderation', 'unmute-audit-log-reason', {
                    u: formatDiscordUserName(user.user),
                    r: reason
                }));
                break;
            case 'quarantine':
                if (!victim.roles.cache.get(quarantineRole.id)) {
                    if (moduleConfig['remove-all-roles-on-quarantine']) {
                        await victim.roles.set([quarantineRole], '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                            u: formatDiscordUserName(user.user),
                            r: reason
                        })).catch(async e => {
                            client.logger.log(localize('moderation', 'batch-role-remove-failed', {i: victim.id, e}));
                            for (const role of victim.roles.cache) { // Remove as much roles as possible
                                await victim.roles.remove(role, '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                                    u: formatDiscordUserName(user.user),
                                    r: reason
                                })).catch((err) => {
                                    client.logger.warn(localize('moderation', 'could-not-remove-role'), {
                                        err,
                                        r: role.id
                                    });
                                });
                            }
                            await victim.roles.add(quarantineRole, '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                                u: formatDiscordUserName(user.user),
                                r: reason
                            }));
                        });
                    } else await victim.roles.add(quarantineRole, '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                        u: formatDiscordUserName(user.user),
                        r: reason
                    }));
                    sendMessage(victim, embedType(expiringAt ? moduleStrings['tmpquarantine_message'] : moduleStrings['quarantine_message'], {
                        '%reason%': reason,
                        '%user%': formatDiscordUserName(user.user),
                        '%date%': expiringAt ? formatDate(expiringAt) : null
                    }));
                    if (victim.voice) await victim.voice.disconnect(localize('moderation', 'quarantine-audit-log-reason', {
                        u: formatDiscordUserName(user.user),
                        r: reason
                    }));
                    if (moduleConfig['changeNicknames']) await victim.setNickname(moduleConfig['changeNicknameOnQuarantine'].split('%nickname%').join(victim.nickname ? victim.nickname : victim.user.username), '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                        u: formatDiscordUserName(user.user),
                        r: reason
                    })).catch(() => {
                    });
                }
                break;
            case 'unquarantine':
                await victim.roles.remove(quarantineRole, `[moderation] ` + localize('moderation', 'unquarantine-audit-log-reason', {r: reason}));
                if (additionalData && moduleConfig['remove-all-roles-on-quarantine']) {
                    await victim.roles.add(additionalData.roles, `[moderation] ` + localize('moderation', 'unquarantine-audit-log-reason')).catch(async e => {
                        client.logger.log(localize('moderation', 'batch-role-add-failed', {i: victim.id, e}));
                        if (additionalData.roles) {
                            for (const role of additionalData.roles) { // Give as much roles as possible
                                await victim.roles.add(role, `[moderation] ` + localize('moderation', 'unquarantine-audit-log-reason')).catch((err) => {
                                    client.logger.warn(localize('moderation', 'could-not-add-role'), {err, r: role.id});
                                });
                            }
                        }
                    });
                }
                sendMessage(victim, embedType(moduleStrings['unquarantine_message'], {
                    '%reason%': reason,
                    '%user%': formatDiscordUserName(user.user)
                }));
                if (moduleConfig['changeNicknames']) await victim.setNickname(victim.user.username).catch(() => {
                });
                break;
            case 'kick':
                sendMessage(victim, embedType(moduleStrings['kick_message'], {
                    '%reason%': reason,
                    '%user%': formatDiscordUserName(user.user)
                }));
                if (victim.kickable) await victim.kick('[moderation] ' + localize('moderation', 'kicked-audit-log-reason', {
                    u: formatDiscordUserName(user.user),
                    r: reason
                }));
                break;
            case 'ban':
                if (!victim.notFound) {
                    await victim.send(embedType(expiringAt ? moduleStrings['tmpban_message'] : moduleStrings['ban_message'], {
                        '%reason%': reason,
                        '%user%': formatDiscordUserName(user.user),
                        '%date%': expiringAt ? formatDate(expiringAt) : null
                    })).catch(() => {
                    });
                    if (victim.bannable) await victim.ban({
                        days: additionalData.days || 0,
                        reason: '[moderation] ' + localize('moderation', 'banned-audit-log-reason', {
                            u: formatDiscordUserName(user.user),
                            r: reason
                        })
                    });
                } else {
                    victim.user = {};
                    victim.user.tag = victim.id;
                    victim.user.id = victim.id;
                    await guild.members.ban(victim.id, {
                        days: additionalData.days || 0,
                        reason: '[moderation] ' + localize('moderation', 'banned-audit-log-reason', {
                            u: formatDiscordUserName(user.user),
                            r: reason
                        })
                    });
                }
                break;
            case 'warn':
                await victim.send(embedType(moduleStrings['warn_message'], {
                    '%reason%': reason,
                    '%user%': formatDiscordUserName(user.user)
                })).catch(() => {
                });
                const warns = await client.models['moderation']['ModerationAction'].findAll({
                    where: {
                        victimID: victim.id,
                        type: 'warn'
                    }
                });
                const warnCount = warns.length + 1;
                if (moduleConfig['automod_enabled'] && moduleConfig['automod'] && moduleConfig['automod'][warnCount]) {
                    const roles = [];
                    victim.roles.cache.forEach(role => roles.push(role.id));
                    const actionConfig = String(moduleConfig['automod'][warnCount]);
                    const autoReasonTemplate = moduleConfig['automod_reason'] || `[${localize('moderation', 'auto-mod')}]: ${localize('moderation', 'reached-warns', {w: warnCount})}`;
                    const actionSpecs = actionConfig.split(/[|,]/).map(s => s.trim()).filter(Boolean);
                    const autoModBatchId = `${victim.id}-${Date.now()}-${warnCount}`;
                    additionalData.autoModBatchId = autoModBatchId;
                    additionalData.autoModActions = [];
                    for (const spec of actionSpecs) {
                        const parts = spec.split(':');
                        let actionType = (parts.shift() || '').trim().toLowerCase();
                        if (actionType === 'timeout') actionType = 'mute';
                        const durationPart = parts.join(':').trim() || null;
                        if (!['mute', 'kick', 'ban', 'quarantine'].includes(actionType)) {
                            client.logger.warn(`[moderation] Invalid automod action "${actionType}" for warn ${warnCount}.`);
                            continue;
                        }
                        if (durationPart) {
                            const durationMs = durationParser(durationPart);
                            if (!durationMs || Number.isNaN(durationMs)) {
                                client.logger.warn(`[moderation] Invalid automod duration "${durationPart}" for warn ${warnCount}.`);
                                continue;
                            }
                        }
                        const autoReason = autoReasonTemplate
                            .split('%w').join(warnCount.toString())
                            .split('%a').join(actionType);
                        additionalData.autoModActions.push({type: actionType, duration: durationPart, reason: autoReason});
                        try {
                            await moderationAction(
                                client,
                                actionType,
                                {user: client.user},
                                victim,
                                autoReason,
                                {roles: roles, autoModBatchId},
                                durationPart ? new Date(new Date().getTime() + durationParser(durationPart)) : null,
                                null,
                                {suppressLog: true}
                            );
                        } catch (e) {
                            client.logger.warn('[moderation] Automod action failed', e);
                        }
                    }
                }
                break;
            case 'channel-mute':
                await additionalData.channel.permissionOverwrites.edit(victim, {SEND_MESSAGES: false}, {
                    reason: '[moderation] ' + localize('moderation', 'channelmute-audit-log-reason', {
                        u: formatDiscordUserName(user.user),
                        r: reason
                    })
                });
                await victim.send(embedType(moduleStrings['channel_mute'], {
                    '%reason%': reason,
                    '%user%': formatDiscordUserName(user.user),
                    '%channel%': additionalData.channel.toString()
                })).catch(() => {
                });
                break;
            case 'unchannel-mute':
                if (additionalData.channel) await additionalData.channel.permissionOverwrites.delete(victim, {
                    reason: '[moderation] ' + localize('moderation', 'unchannelmute-audit-log-reason', {
                        u: formatDiscordUserName(user.user),
                        r: reason
                    })
                });
                await victim.send(embedType(moduleStrings['remove-channel_mute'], {
                    '%reason%': reason,
                    '%user%': formatDiscordUserName(user.user),
                    '%channel%': additionalData.channel ? additionalData.channel.toString() : 'Unknown'
                })).catch(() => {
                });
                break;
            case 'unwarn':
                break;
            case 'unban':
                try {
                    await guild.members.unban(victim, '[moderation] ' + localize('moderation', 'unbanned-audit-log-reason', {
                        u: formatDiscordUserName(user.user),
                        r: reason
                    }));
                } catch (e) {
                    return reject(e);
                }
                const userid = victim;
                const unbannedUser = await client.users.fetch(userid).catch(() => {
                });
                victim = {user: unbannedUser, id: userid};
                if (!unbannedUser) {
                    victim = {};
                    victim.user = {};
                    victim.user.tag = userid;
                    victim.user.id = userid;
                    victim.id = userid;
                }
                break;
            default:
                return reject('Option not found');
        }
        const memberID = user.id || (user.user ? user.user.id : null);
        const modAction = await client.models['moderation']['ModerationAction'].create({
            victimID: victim.id,
            memberID,
            reason,
            type: type,
            additionalData: additionalData,
            expiresOn: expiringAt
        });
        if (expiringAt) await planExpiringAction(expiringAt, modAction, guild);

        let logVictimIDs = [victim.id];
        let logLinkedIDs = [];
        const groupLogEnabled = moduleConfig['linked_accounts_group_log'] !== false;
        const showGroupedLinked = moduleConfig['linked_accounts_group_log_show_linked'] === true;
        if (moduleConfig['linked_accounts_enabled'] && !options.isMirrored && !options.disableLinkedMirror && moduleConfig['linked_accounts_mode'] === 'mirror') {
            const mirrorList = new Set(moduleConfig['linked_accounts_mirror_actions'] || []);
            if (mirrorList.has('quarantine') && !mirrorList.has('unquarantine')) mirrorList.add('unquarantine');
            if (mirrorList.has(type)) {
                const linkedGroup = await getLinkedGroup(client, victim.id);
                if (linkedGroup && linkedGroup.userIDs.length > 1) {
                    const linkedIDs = linkedGroup.userIDs.filter(id => id !== victim.id);
                    if (groupLogEnabled && showGroupedLinked) {
                        logLinkedIDs = linkedIDs;
                    }
                    for (const linkedID of linkedGroup.userIDs) {
                        if (linkedID === victim.id) continue;
                        let linkedVictim = await guild.members.fetch(linkedID).catch(() => null);
                        if (!linkedVictim) {
                            if (type === 'ban') {
                                linkedVictim = {id: linkedID, notFound: true, user: {id: linkedID, tag: linkedID}};
                            } else if (type === 'unban') {
                                linkedVictim = linkedID;
                            } else {
                                continue;
                            }
                        }
                        let mirrorAdditionalData = additionalData;
                        if (type === 'quarantine' && linkedVictim.roles) {
                            const quarantineRoleId = moduleConfig['quarantine-role-id'];
                            if (linkedVictim.roles.cache.get(quarantineRoleId)) {
                                const linkedLastAction = await client.models['moderation']['ModerationAction'].findOne({
                                    where: {
                                        victimID: linkedID,
                                        type: 'quarantine'
                                    },
                                    order: [['createdAt', 'DESC']]
                                });
                                const linkedRoles = (linkedLastAction && linkedLastAction.additionalData && linkedLastAction.additionalData.roles instanceof Array)
                                    ? linkedLastAction.additionalData.roles
                                    : [];
                                mirrorAdditionalData = {roles: linkedRoles};
                            } else {
                                mirrorAdditionalData = {roles: Array.from(linkedVictim.roles.cache.keys()).filter(r => r !== quarantineRoleId)};
                            }
                        }
                        if (type === 'unquarantine') {
                            const linkedLastAction = await client.models['moderation']['ModerationAction'].findOne({
                                where: {
                                    victimID: linkedID,
                                    type: 'quarantine'
                                },
                                order: [['createdAt', 'DESC']]
                            });
                            const linkedRoles = (linkedLastAction && linkedLastAction.additionalData && linkedLastAction.additionalData.roles instanceof Array)
                                ? linkedLastAction.additionalData.roles
                                : [];
                            mirrorAdditionalData = {roles: linkedRoles};
                        }
                        await moderationAction(client, type, user, linkedVictim, reason, mirrorAdditionalData, expiringAt, proof, {
                            isMirrored: true,
                            suppressLog: !!moduleConfig['linked_accounts_suppress_log_channel'] || groupLogEnabled,
                            skipCacheUpdate: true
                        });
                    }
                }
            }
        }
        let channel = guild.channels.cache.get(moduleConfig['logchannel-id']);
        if (!channel) channel = client.logChannel;
        if (options.suppressLog) {
            // Skip log channel for mirrored actions if configured
        } else if (!channel) {
            client.logger.error('[moderation] ' + localize('moderation', 'missing-logchannel'));
        } else {
            const fields = [];
            if (expiringAt) fields.push({
                name: localize('moderation', 'expires-at'),
                value: dateToDiscordTimestamp(expiringAt),
                inline: true
            });
            if (proof) fields.push({
                name: localize('moderation', 'proof'),
                value: `[${localize('moderation', 'file')}](${proof.proxyURL || proof.url})`,
                inline: true
            });
            if (additionalData.channel) fields.push({
                name: localize('moderation', 'channel'),
                value: additionalData.channel.toString(),
                inline: true
            });
            if (type === 'warn' && additionalData.autoModActions && additionalData.autoModActions.length > 0) {
                const autoModLines = additionalData.autoModActions.map((entry) => {
                    if (typeof entry === 'string') {
                        const parts = entry.split(':');
                        const t = parts[0];
                        const d = parts.slice(1).join(':') || localize('moderation', 'unknown');
                        return localize('moderation', 'automod-log-line', {d, a: t, r: ''}).trim();
                    }
                    const t = entry.type;
                    const d = entry.duration || localize('moderation', 'unknown');
                    return localize('moderation', 'automod-log-line', {d, a: t, r: entry.reason || ''}).trim();
                });
                fields.push({
                    name: localize('moderation', 'automod-log-field'),
                    value: autoModLines.join('\n')
                });
            }
            const victimMentions = logVictimIDs.map(id => `<@${id}>`).join(', ');
            if (logLinkedIDs.length > 0 && groupLogEnabled && showGroupedLinked) {
                fields.push({
                    name: localize('moderation', 'linked-accounts-log-field'),
                    value: logLinkedIDs.map(id => `<@${id}>`).join(', ')
                });
            }
            await channel.send({
                // eslint-disable-next-line
                embeds: [new MessageEmbed().setColor(expiringAt ? 0xf1c40f : (type.includes('un') ? 0x2ecc71 : 0xe74c3c)).setFooter({
                    text: client.strings.footer,
                    iconURL: client.strings.footerImgUrl
                }).setTimestamp().setImage(proof ? (proof.proxyURL || proof.url) : null).setAuthor({
                    name: formatDiscordUserName(client.user),
                    iconURL: client
                        .user.avatarURL()
                }).setTitle(`${localize('moderation', 'case')} #${modAction.actionID}`).setThumbnail(client.user.avatarURL()).addField(localize('moderation', 'victim'), victimMentions, true)
                    .addField('User', `<@${user.user.id}>`, true).addField(localize('moderation', 'action'), expiringAt ? `tmp-${type}` : type, true).addFields(fields).addField(localize('moderation', 'reason'), reason)]
            });
        }
        if (!options.skipCacheUpdate) {
            const {updateCache} = require('./events/botReady');
            updateCache(client).catch((e) => {
                client.logger.warn('[moderation] updateCache failed', e);
            });
        }
        resolve(modAction);
        } catch (e) {
            client.logger.error('[moderation] moderationAction failed', e);
            reject(e);
        }
    });
}

module.exports.moderationAction = moderationAction;

/**
 * Sends a DM ot a user
 * @private
 * @param {User} user User to send Message to
 * @param {Object|String} content Content to send to the user
 */
function sendMessage(user, content) {
    user.send(content).catch(() => {
    });
}

/**
 * Plan an expiring moderative action
 * @private
 * @param {Date} expiringDate Date when action exires
 * @param {String} action Type of action
 * @param {Guild} guild Guild
 * @return {Promise<void>}
 */
async function planExpiringAction(expiringDate, action, guild) {
    if (!expiringDate) return;
    guild.client.jobs.push(scheduleJob(expiringDate, async () => {
        const now = new Date();
        const actionRecord = await guild.client.models['moderation']['ModerationAction'].findOne({
            where: {actionID: action.actionID}
        });
        if (actionRecord && actionRecord.expiresOn && new Date(actionRecord.expiresOn) > now) return;
        const newerAction = await guild.client.models['moderation']['ModerationAction'].findOne({
            where: {
                victimID: action.victimID,
                type: action.type,
                createdAt: {
                    [Op.gt]: action.createdAt
                },
                expiresOn: {
                    [Op.gt]: now
                }
            },
            order: [['createdAt', 'DESC']]
        });
        if (newerAction) return;
        const undoAction = 'un' + action.type;
        const undoneModAction = await guild.client.models['moderation']['ModerationAction'].findOne({
            where: {
                victimID: action.victimID,
                type: undoAction,
                createdAt: {
                    [Op.gte]: action.createdAt
                }
            }
        });
        if (undoneModAction) return;
        let member = action.victimID;
        if (undoAction !== 'unban') {
            member = await guild.members.fetch(action.victimID).catch(() => {
            });
            if (!member) return;
        }
        await moderationAction(guild.client, undoAction, guild.me, member, `[${localize('moderation', 'auto-mod')}] ${localize('moderation', 'action-expired')}`, {roles: action.additionalData.roles});
    }));
}

module.exports.planExpiringAction = planExpiringAction;
