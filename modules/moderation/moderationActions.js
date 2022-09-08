const {scheduleJob} = require('node-schedule');
const {embedType, formatDate, dateToDiscordTimestamp} = require('../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../src/functions/localize');
const durationParser = require('parse-duration');

/**
 * Performs a mod action
 * @param {Client} client Client
 * @param {String} type Typ of action to run
 * @param {User} user User who run this action
 * @param {Member} victim Member on who this action should get executed
 * @param {String} reason Reason for this action
 * @param {Object} additionalData Additional data needed for executing this action
 * @param {Date} expiringAt Date when this action should expire
 * @return {Promise<unknown>}
 */
async function moderationAction(client, type, user, victim, reason, additionalData = {}, expiringAt = null) {
    const moduleConfig = client.configurations['moderation']['config'];
    const moduleStrings = client.configurations['moderation']['strings'];
    if (!reason) reason = localize('moderation', 'no-reason');
    return new Promise(async (resolve, reject) => {
        const guild = await client.guilds.fetch(client.guildID);
        const quarantineRole = await guild.roles.fetch(moduleConfig['quarantine-role-id']).catch(() => {
        });
        if (!quarantineRole && (type === 'quarantine' || type === 'unquarantine')) {
            client.logger.error(localize('moderation', 'quarantinerole-not-found'));
            return reject(localize('moderation', 'quarantinerole-not-found'));
        }
        switch (type) {
            case 'mute':
                if (!expiringAt) expiringAt = new Date(new Date().getTime() + 1209600000);
                await victim.timeout(expiringAt.getTime() - new Date().getTime(), localize('moderation', 'mute-audit-log-reason', {
                    u: user.user.tag,
                    r: reason
                }));
                sendMessage(victim, embedType(expiringAt ? moduleStrings['tmpmute_message'] : moduleStrings['mute_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag,
                    '%date%': expiringAt ? formatDate(expiringAt) : null
                }));
                await victim.setNickname(moduleConfig['changeNicknameOnMute'] ? moduleConfig['changeNicknameOnMute'].split('%nickname%').join(victim.nickname ? victim.nickname : victim.user.username) : victim.nickname, '[moderation] ' + localize('moderation', 'mute-audit-log-reason', {
                    u: user.user.tag,
                    r: reason
                })).catch(() => {
                });
                break;
            case 'unmute':
                if (victim.isCommunicationDisabled()) await victim.timeout(null, localize('moderation', 'unmute-audit-log-reason', {
                    u: user.user.tag,
                    r: reason
                }));
                sendMessage(victim, embedType(moduleStrings['unmute_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                }));
                await victim.setNickname(victim.user.username, '[moderation] ' + localize('moderation', 'unmute-audit-log-reason', {
                    u: user.user.tag,
                    r: reason
                }));
                break;
            case 'quarantine':
                if (!victim.roles.cache.get(quarantineRole.id)) {
                    if (moduleConfig['remove-all-roles-on-quarantine']) {
                        await victim.roles.set([quarantineRole], '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                            u: user.user.tag,
                            r: reason
                        })).catch(async e => {
                            client.logger.log(localize('moderation', 'batch-role-remove-failed', {i: victim.id, e}));
                            for (const role of victim.roles.cache) { // Remove as much roles as possible
                                await victim.roles.remove(role, '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                                    u: user.user.tag,
                                    r: reason
                                })).catch((err) => {
                                    client.logger.warn(localize('moderation', 'could-not-remove-role'), {
                                        err,
                                        r: role.id
                                    });
                                });
                            }
                            await victim.roles.add(quarantineRole, '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                                u: user.user.tag,
                                r: reason
                            }));
                        });
                    } else await victim.roles.add(quarantineRole, '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                        u: user.user.tag,
                        r: reason
                    }));
                    sendMessage(victim, embedType(expiringAt ? moduleStrings['tmpquarantine_message'] : moduleStrings['quarantine_message'], {
                        '%reason%': reason,
                        '%user%': user.user.tag,
                        '%date%': expiringAt ? formatDate(expiringAt) : null
                    }));
                    if (victim.voice) await victim.voice.disconnect(localize('moderation', 'quarantine-audit-log-reason', {
                        u: user.user.tag,
                        r: reason
                    }));
                    await victim.setNickname(moduleConfig['changeNicknameOnQuarantine'] ? moduleConfig['changeNicknameOnQuarantine'].split('%nickname%').join(victim.nickname ? victim.nickname : victim.user.username) : victim.nickname, '[moderation] ' + localize('moderation', 'quarantine-audit-log-reason', {
                        u: user.user.tag,
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
                    '%user%': user.user.tag
                }));
                await victim.setNickname(victim.user.username).catch(() => {
                });
                break;
            case 'kick':
                sendMessage(victim, embedType(moduleStrings['kick_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                }));
                if (victim.kickable) await victim.kick('[moderation] ' + localize('moderation', 'kicked-audit-log-reason', {
                    u: user.user.tag,
                    r: reason
                }));
                break;
            case 'ban':
                if (!victim.notFound) {
                    await victim.send(embedType(expiringAt ? moduleStrings['tmpban_message'] : moduleStrings['ban_message'], {
                        '%reason%': reason,
                        '%user%': user.user.tag,
                        '%date%': expiringAt ? formatDate(expiringAt) : null
                    })).catch(() => {});
                    if (victim.bannable) await victim.ban({
                        days: additionalData.days || 0,
                        reason: '[moderation] ' + localize('moderation', 'banned-audit-log-reason', {
                            u: user.user.tag,
                            r: reason
                        })
                    });
                } else {
                    victim.user = {};
                    victim.user.tag = victim.id;
                    victim.user.id = victim.id;
                    await guild.members.ban(victim.id, {
                        days: additionalData.days || 0,
                        reason: `[moderation] Got banned by ${user.user.tag} because of "${reason}"`
                    });
                }
                break;
            case 'warn':
                await victim.send(embedType(moduleStrings['warn_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                })).catch(() => {
                });
                const warns = await client.models['moderation']['ModerationAction'].findAll({
                    where: {
                        victimID: victim.id,
                        type: 'warn'
                    }
                });
                if (moduleConfig['automod'][warns.length + 1]) {
                    const roles = [];
                    victim.roles.cache.forEach(role => roles.push(role.id));
                    await moderationAction(client, moduleConfig['automod'][warns.length + 1].split(':')[0], {user: client.user}, victim, `[${localize('moderation', 'auto-mod')}]: ${localize('moderation', 'reached-warns', {w: warns.length + 1})}`, {roles: roles}, moduleConfig['automod'][warns.length + 1].includes(':') ? new Date(new Date().getTime() + durationParser(moduleConfig['automod'][warns.length + 1].split(':')[1])) : null);
                }
                break;
            case 'unwarn':
                break;
            case 'unban':
                try {
                    await guild.members.unban(victim, '[moderation] ' + localize('moderation', 'unbanned-audit-log-reason', {
                        u: user.user.tag,
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
        const modAction = await client.models['moderation']['ModerationAction'].create({
            victimID: victim.id,
            memberID: user.id,
            reason,
            type: type,
            additionalData: additionalData,
            expiresOn: expiringAt
        });
        if (expiringAt) await planExpiringAction(expiringAt, modAction, guild);
        let channel = guild.channels.cache.get(moduleConfig['logchannel-id']);
        if (!channel) channel = client.logChannel;
        if (!channel) {
            client.error('[moderation] ' + localize('moderation', 'missing-logchannel'));
        } else {
            const fields = [];
            if (expiringAt) fields.push({
                name: localize('moderation', 'expires-at'),
                value: dateToDiscordTimestamp(expiringAt)
            });
            await channel.send({
                // eslint-disable-next-line
                embeds: [new MessageEmbed().setColor(expiringAt ? 0xf1c40f : (type.includes('un') ? 0x2ecc71 : 0xe74c3c)).setFooter({
                    text: client.strings.footer,
                    iconURL: client.strings.footerImgUrl
                }).setTimestamp().setAuthor({
                    name: client
                        .user.tag,
                    iconURL: client
                        .user.avatarURL()
                }).setTitle(`${localize('moderation', 'case')} #${modAction.actionID}`).setThumbnail(client.user.avatarURL()).addField(localize('moderation', 'victim'), `${victim.user.tag}\n\`${victim.user.id}\``, true)
                    .addField('User', `${user.user.tag}\n\`${user.user.id}\``, true).addField(localize('moderation', 'action'), expiringAt ? `tmp-${type}` : type, true).addField(localize('moderation', 'reason'), reason).addFields(fields)]
            });
        }
        const {updateCache} = require('./events/botReady');
        await updateCache(client);
        resolve(modAction);
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
    guild.client.jobs.push(scheduleJob(expiringDate, async () => {
        const undoAction = 'un' + action.type;
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