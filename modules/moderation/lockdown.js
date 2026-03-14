const {ChannelType, PermissionFlagsBits} = require('discord.js');
const {MessageEmbed} = require('discord.js');
const {embedType, parseEmbedColor, safeSetFooter} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

let autoLiftTimeout = null;
let lockdownInProgress = false;

/**
 * Check if a lockdown is currently active
 * @param {Client} client Discord client
 * @returns {Promise<boolean>}
 */
async function isLockdownActive(client) {
    const state = await client.models['moderation']['LockdownState'].findOne({where: {active: true}});
    return !!state;
}

/**
 * Restore lockdown state after bot restart
 * @param {Client} client Discord client
 * @returns {Promise<void>}
 */
async function restoreLockdownState(client) {
    const state = await client.models['moderation']['LockdownState'].findOne({where: {active: true}});
    if (!state) return;

    const lockdownConfig = client.configurations['moderation']['lockdown'];
    if (!lockdownConfig || !lockdownConfig.enabled) return;

    client.logger.info(localize('moderation', 'lockdown-restored'));

    if (lockdownConfig.autoLiftAfter > 0 && state.startedAt) {
        const elapsed = (Date.now() - new Date(state.startedAt).getTime()) / 60000;
        const remaining = lockdownConfig.autoLiftAfter - elapsed;
        if (remaining <= 0) {
            await liftLockdown(client, localize('moderation', 'lockdown-auto-lift-reason'), localize('moderation', 'lockdown-system'));
        } else {
            autoLiftTimeout = setTimeout(async () => {
                await liftLockdown(client, localize('moderation', 'lockdown-auto-lift-reason'), localize('moderation', 'lockdown-system'));
            }, remaining * 60000);
        }
    }
}

/**
 * Activate server-wide lockdown
 * @param {Client} client Discord client
 * @param {string} reason Reason for the lockdown
 * @param {string} triggeredBy Display name of who/what triggered the lockdown
 * @param {boolean} isAutomatic Whether this was triggered automatically
 * @returns {Promise<Object>} Summary of affected channels and roles
 */
async function activateLockdown(client, reason, triggeredBy, isAutomatic = false) {
    if (lockdownInProgress) return null;
    if (await isLockdownActive(client)) return null;
    lockdownInProgress = true;

    try {
        const lockdownConfig = client.configurations['moderation']['lockdown'];
        const guild = client.guild;
        const moduleConfig = client.configurations['moderation']['config'];

        const affectedChannels = [];
        const permissionBackup = [];

        const botHighestRole = guild.members.me.roles.highest;

        const moderatorRoles = new Set([
            ...(moduleConfig['moderator-roles_level4'] || [])
        ]);

        // PHASE 1: Collect all permission overwrites BEFORE making any changes
        const channelsToLockdown = [];
        for (const [, channel] of guild.channels.cache) {
            if (channel.type === ChannelType.GuildCategory) continue;
            if (!channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.ManageChannels)) continue;
            if (!channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.ViewChannel)) continue;
            if (!channel.permissionOverwrites || !channel.permissionOverwrites.cache) continue;

            const overwrites = Array.from(channel.permissionOverwrites.cache.values()).map(o => ({
                id: o.id,
                type: o.type,
                allow: o.allow.bitfield.toString(),
                deny: o.deny.bitfield.toString()
            }));
            permissionBackup.push({channelID: channel.id, overwrites});
            channelsToLockdown.push(channel);
        }

        // PHASE 2: Save backup to database BEFORE applying any changes
        // This ensures we can restore even if something fails during lockdown
        const lockdownState = await client.models['moderation']['LockdownState'].create({
            active: true,
            reason,
            triggeredBy,
            isAutomatic,
            permissionBackup,
            startedAt: new Date()
        });

        client.logger.info(`[moderation] [lockdown] Backup saved to database with ${permissionBackup.length} channels`);

        // PHASE 3: Now apply the lockdown changes
        // If any error occurs here, the backup is already saved and can be restored
        let successfullyLockedCount = 0;
        for (const channel of channelsToLockdown) {
            try {
                const everyoneRole = guild.roles.everyone;
                const isVoiceChannel = channel.type === ChannelType.GuildVoice;
                const isStageChannel = channel.type === ChannelType.GuildStageVoice;

                // Lock text channels
                if (!isVoiceChannel && !isStageChannel) {
                    if (channel.permissionOverwrites) {
                        await channel.permissionOverwrites.edit(everyoneRole, {
                            SendMessages: false,
                            SendMessagesInThreads: false,
                            AddReactions: false,
                            CreatePublicThreads: false,
                            CreatePrivateThreads: false
                        }, {reason: `[moderation] [lockdown] ${reason}`}).catch(() => {});
                    }

                    for (const [, role] of guild.roles.cache) {
                        if (role.id === everyoneRole.id) continue;
                        if (role.managed) continue;
                        if (role.position >= botHighestRole.position) continue;
                        if (moderatorRoles.has(role.id)) continue;

                        if (!channel.permissionOverwrites || !channel.permissionOverwrites.cache) continue;

                        const overwrite = channel.permissionOverwrites.cache.get(role.id);
                        if (overwrite && overwrite.allow.has(PermissionFlagsBits.SendMessages)) {
                            await channel.permissionOverwrites.edit(role, {
                                SendMessages: false,
                                SendMessagesInThreads: false,
                                CreatePublicThreads: false,
                                CreatePrivateThreads: false
                            }, {reason: `[moderation] [lockdown] ${reason}`}).catch(() => {});
                        }
                    }

                    for (const modRoleId of moderatorRoles) {
                        if (!channel.permissionOverwrites) continue;
                        await channel.permissionOverwrites.edit(modRoleId, {
                            SendMessages: true,
                            SendMessagesInThreads: true,
                            CreatePublicThreads: true,
                            CreatePrivateThreads: true
                        }, {reason: `[moderation] [lockdown] Moderator override`}).catch(() => {});
                    }
                }

                // Lock voice channels (including voice text channels)
                if (isVoiceChannel) {
                    if (channel.permissionOverwrites) {
                        await channel.permissionOverwrites.edit(everyoneRole, {
                            Connect: false,
                            Speak: false,
                            SendMessages: false,
                            SendMessagesInThreads: false,
                            CreatePublicThreads: false,
                            CreatePrivateThreads: false
                        }, {reason: `[moderation] [lockdown] ${reason}`}).catch(() => {});
                    }

                    for (const [, role] of guild.roles.cache) {
                        if (role.id === everyoneRole.id) continue;
                        if (role.managed) continue;
                        if (role.position >= botHighestRole.position) continue;
                        if (moderatorRoles.has(role.id)) continue;

                        if (!channel.permissionOverwrites || !channel.permissionOverwrites.cache) continue;

                        const overwrite = channel.permissionOverwrites.cache.get(role.id);
                        if (overwrite && (overwrite.allow.has(PermissionFlagsBits.Connect) || overwrite.allow.has(PermissionFlagsBits.Speak) || overwrite.allow.has(PermissionFlagsBits.SendMessages))) {
                            await channel.permissionOverwrites.edit(role, {
                                Connect: false,
                                Speak: false,
                                SendMessages: false,
                                SendMessagesInThreads: false,
                                CreatePublicThreads: false,
                                CreatePrivateThreads: false
                            }, {reason: `[moderation] [lockdown] ${reason}`}).catch(() => {});
                        }
                    }

                    for (const modRoleId of moderatorRoles) {
                        if (!channel.permissionOverwrites) continue;
                        await channel.permissionOverwrites.edit(modRoleId, {
                            Connect: true,
                            Speak: true,
                            SendMessages: true,
                            SendMessagesInThreads: true,
                            CreatePublicThreads: true,
                            CreatePrivateThreads: true
                        }, {reason: `[moderation] [lockdown] Moderator override`}).catch(() => {});
                    }
                }

                // Lock stage channels
                if (isStageChannel) {
                    if (channel.permissionOverwrites) {
                        await channel.permissionOverwrites.edit(everyoneRole, {
                            Connect: false,
                            RequestToSpeak: false,
                            SendMessages: false,
                            SendMessagesInThreads: false,
                            CreatePublicThreads: false,
                            CreatePrivateThreads: false
                        }, {reason: `[moderation] [lockdown] ${reason}`}).catch(() => {});
                    }

                    for (const [, role] of guild.roles.cache) {
                        if (role.id === everyoneRole.id) continue;
                        if (role.managed) continue;
                        if (role.position >= botHighestRole.position) continue;
                        if (moderatorRoles.has(role.id)) continue;

                        // Safety check before accessing cache
                        if (!channel.permissionOverwrites || !channel.permissionOverwrites.cache) continue;

                        const overwrite = channel.permissionOverwrites.cache.get(role.id);
                        if (overwrite && (overwrite.allow.has(PermissionFlagsBits.Connect) || overwrite.allow.has(PermissionFlagsBits.RequestToSpeak) || overwrite.allow.has(PermissionFlagsBits.SendMessages))) {
                            await channel.permissionOverwrites.edit(role, {
                                Connect: false,
                                RequestToSpeak: false,
                                SendMessages: false,
                                SendMessagesInThreads: false,
                                CreatePublicThreads: false,
                                CreatePrivateThreads: false
                            }, {reason: `[moderation] [lockdown] ${reason}`}).catch(() => {});
                        }
                    }

                    for (const modRoleId of moderatorRoles) {
                        if (!channel.permissionOverwrites) continue;
                        await channel.permissionOverwrites.edit(modRoleId, {
                            Connect: true,
                            RequestToSpeak: true,
                            SendMessages: true,
                            SendMessagesInThreads: true,
                            CreatePublicThreads: true,
                            CreatePrivateThreads: true
                        }, {reason: `[moderation] [lockdown] Moderator override`}).catch(() => {});
                    }
                }

                affectedChannels.push(channel.id);
                successfullyLockedCount++;

                if (lockdownConfig.sendMessageInAffectedChannels && typeof channel.send === 'function') {
                    const msgPayload = embedType(lockdownConfig.lockdownMessage, {
                        '%reason%': reason,
                        '%user%': triggeredBy
                    });
                    await channel.send(msgPayload).catch(() => {});
                }
            } catch (error) {
                client.logger.error(`[moderation] [lockdown] Failed to lock channel ${channel.id}: ${error.message}`);
            }
        }

        client.logger.info(`[moderation] [lockdown] Successfully locked ${successfullyLockedCount}/${channelsToLockdown.length} channels`);

        let kickedUsersCount = 0;
        let totalVoiceUsers = 0;
        for (const [, channel] of guild.channels.cache) {
            if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
            if (!channel.members) continue;

            for (const [, member] of channel.members) {
                totalVoiceUsers++;
                const isModerator = member.roles.cache.some(role => moderatorRoles.has(role.id));
                if (isModerator) continue;

                try {
                    await member.voice.disconnect(`[moderation] [lockdown] ${reason}`);
                    kickedUsersCount++;
                } catch (error) {
                    client.logger.warn(`[moderation] [lockdown] Failed to kick user ${member.id} from voice: ${error.message}`);
                }
            }
        }

        if (totalVoiceUsers > 0) {
            client.logger.info(`[moderation] [lockdown] Kicked ${kickedUsersCount}/${totalVoiceUsers} non-moderator users from voice channels`);
        }

        const logChannel = await getLogChannel(client, lockdownConfig);
        if (logChannel) {
            const lockdownEmbed = new MessageEmbed()
                .setColor(parseEmbedColor('RED'))
                .setTitle('🔒 ' + localize('moderation', 'lockdown-activated'))
                .setDescription(localize('moderation', 'lockdown-log-description', {
                    r: reason,
                    u: triggeredBy,
                    t: isAutomatic ? localize('moderation', 'lockdown-automatic') : localize('moderation', 'lockdown-manual'),
                    c: affectedChannels.length.toString()
                }))
                .setTimestamp();

            if (kickedUsersCount > 0) {
                lockdownEmbed.addField(
                    '👢 ' + localize('moderation', 'lockdown-users-kicked', {}, 'Users Kicked'),
                    localize('moderation', 'lockdown-users-kicked-description', {k: kickedUsersCount.toString()}, `${kickedUsersCount} non-moderator users were disconnected from voice channels.`)
                );
            }

            safeSetFooter(lockdownEmbed, client);
            await logChannel.send({
                embeds: [lockdownEmbed]
            }).catch(() => {});
        }

        if (lockdownConfig.autoLiftAfter > 0) {
            autoLiftTimeout = setTimeout(async () => {
                await liftLockdown(client, localize('moderation', 'lockdown-auto-lift-reason'), localize('moderation', 'lockdown-system'));
            }, lockdownConfig.autoLiftAfter * 60000);
        }

        return {affectedChannels: affectedChannels.length};
    } finally {
        lockdownInProgress = false;
    }
}

/**
 * Lift server-wide lockdown
 * @param {Client} client Discord client
 * @param {string} reason Reason for lifting
 * @param {string} liftedBy Display name of who lifted the lockdown
 * @returns {Promise<Object>} Summary of restored channels
 */
async function liftLockdown(client, reason, liftedBy) {
    if (lockdownInProgress) return null;
    const state = await client.models['moderation']['LockdownState'].findOne({where: {active: true}});
    if (!state) return null;
    lockdownInProgress = true;

    try {
        const lockdownConfig = client.configurations['moderation']['lockdown'];
        const guild = client.guild;

        if (autoLiftTimeout) {
            clearTimeout(autoLiftTimeout);
            autoLiftTimeout = null;
        }

        let restoredCount = 0;
        for (const backup of (state.permissionBackup || [])) {
            const channel = guild.channels.cache.get(backup.channelID);
            if (!channel) continue;
            if (!channel.permissionOverwrites) continue;

            try {
                await channel.permissionOverwrites.set(backup.overwrites.map(o => ({
                    id: o.id,
                    type: o.type,
                    allow: BigInt(o.allow),
                    deny: BigInt(o.deny)
                })), `[moderation] [lockdown-lift] ${reason}`);
                restoredCount++;

                if (lockdownConfig.sendMessageInAffectedChannels && typeof channel.send === 'function') {
                    await channel.send(embedType(lockdownConfig.liftMessage, {
                        '%user%': liftedBy
                    })).catch(() => {});
                }
            } catch (e) {
                client.logger.warn(localize('moderation', 'lockdown-restore-failed', {c: backup.channelID, e: e.toString()}));
            }
        }

        const logChannel = await getLogChannel(client, lockdownConfig);
        if (logChannel) {
            const liftEmbed = new MessageEmbed()
                .setColor(parseEmbedColor('GREEN'))
                .setTitle('🔓 ' + localize('moderation', 'lockdown-lifted'))
                .setDescription(localize('moderation', 'lockdown-lift-log-description', {
                    r: reason,
                    u: liftedBy,
                    c: restoredCount.toString()
                }))
                .setTimestamp();
            safeSetFooter(liftEmbed, client);
            await logChannel.send({
                embeds: [liftEmbed]
            }).catch(() => {});
        }

        state.active = false;
        await state.save();

        return {restoredChannels: restoredCount};
    } finally {
        lockdownInProgress = false;
    }
}

/**
 * Get the log channel for lockdown events
 * @private
 * @param {Client} client Discord client
 * @param {Object} lockdownConfig Lockdown configuration
 * @returns {Promise<Channel|null>}
 */
async function getLogChannel(client, lockdownConfig) {
    if (lockdownConfig.logChannel) {
        const ch = await client.channels.fetch(lockdownConfig.logChannel).catch(() => {});
        if (ch) return ch;
    }
    const moduleConfig = client.configurations['moderation']['config'];
    if (moduleConfig['logchannel-id']) {
        return client.channels.fetch(moduleConfig['logchannel-id']).catch(() => null);
    }
    return client.logChannel || null;
}

module.exports.activateLockdown = activateLockdown;
module.exports.liftLockdown = liftLockdown;
module.exports.isLockdownActive = isLockdownActive;
module.exports.restoreLockdownState = restoreLockdownState;