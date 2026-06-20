const {embedType} = require('./../../../src/functions/helpers');
const {Op} = require('sequelize');
const {localize} = require('../../../src/functions/localize');
const {sendMessage} = require('../channel-settings');
const {formatDiscordUserName} = require('../../../src/functions/helpers');
const {ChannelType} = require('discord.js');

module.exports.run = async function (client, oldState, newState) {
    if (!client.botReadyAt) return;
    const moduleConfig = client.configurations['temp-channels']['config'];

    // Handle channel leave — delete or archive
    if (oldState.channel) {
        const oldChannel = await client.models['temp-channels']['TempChannel'].findOne({
            where: {id: oldState.channel.id}
        });
        if (oldChannel && !oldChannel.archivedAt) {
            setTimeout(async () => {
                try {
                    const dcOldChannel = await client.channels.fetch(oldChannel.id).catch(() => null);
                    if (dcOldChannel && dcOldChannel.members.size === 0) {
                        if (moduleConfig.enableArchiving && moduleConfig.archiveCategory) {
                            // Archive: move to archive category, strip permissions
                            await dcOldChannel.setParent(moduleConfig.archiveCategory, {
                                lockPermissions: false,
                                reason: '[temp-channels] Archiving empty temp channel'
                            }).catch(() => {
                            });
                            await dcOldChannel.permissionOverwrites.set([
                                {
                                    id: dcOldChannel.guild.roles.everyone,
                                    deny: ['CONNECT', 'VIEW_CHANNEL']
                                },
                                {
                                    id: dcOldChannel.guild.members.me,
                                    allow: ['CONNECT', 'VIEW_CHANNEL', 'MANAGE_CHANNELS']
                                }
                            ], '[temp-channels] Archiving channel');
                            if (oldChannel.noMicChannel) {
                                const noMicChannel = await client.channels.fetch(oldChannel.noMicChannel).catch(() => null);
                                if (noMicChannel) {
                                    await noMicChannel.setParent(moduleConfig.archiveCategory, {
                                        lockPermissions: false,
                                        reason: '[temp-channels] Archiving no-mic channel'
                                    }).catch(() => {
                                    });
                                    await noMicChannel.permissionOverwrites.set([
                                        {
                                            id: noMicChannel.guild.roles.everyone,
                                            deny: ['VIEW_CHANNEL']
                                        },
                                        {
                                            id: noMicChannel.guild.members.me,
                                            allow: ['VIEW_CHANNEL']
                                        }
                                    ], '[temp-channels] Archiving no-mic channel').catch(() => {
                                    });
                                }
                            }
                            oldChannel.archivedAt = new Date();
                            await oldChannel.save();
                        } else {
                            // Delete channel
                            if (oldChannel.noMicChannel) {
                                const noMicChannel = await client.channels.fetch(oldChannel.noMicChannel).catch(() => null);
                                if (noMicChannel) await noMicChannel.delete(`[temp-channels] ${localize('temp-channels', 'removed-audit-log-reason')}`).catch(() => {
                                });
                            }
                            await dcOldChannel.delete(`[temp-channels] ${localize('temp-channels', 'removed-audit-log-reason')}`).catch(() => {
                            });
                            await oldChannel.destroy();
                        }
                    } else if (!dcOldChannel) {
                        await oldChannel.destroy();
                    }
                } catch (error) {
                    client.logger.warn(`[temp-channels] Error during channel cleanup: ${error.message}`);
                }
            }, moduleConfig['timeout'] * 1000);
        }
    }

    // No-mic channel visibility sync
    if (moduleConfig['create_no_mic_channel']) {
        const possibleExistingChannel = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.or]: [
                    {id: newState.channel ? newState.channel.id : false},
                    {id: oldState.channel ? oldState.channel.id : false}
                ]
            }
        });
        if (possibleExistingChannel && !possibleExistingChannel.archivedAt) {
            const existingNoMicChannel = await newState.guild.channels.cache.get(possibleExistingChannel.noMicChannel);
            if (existingNoMicChannel) await existingNoMicChannel.permissionOverwrites.create(newState.member, {
                'VIEW_CHANNEL': newState.channel && newState.channel.id === possibleExistingChannel.id
            }, {reason: '[temp-channels] ' + localize('temp-channels', 'permission-update-audit-log-reason')});
        }
    }

    if (!newState.channel) return;

    if (newState.channel.id === moduleConfig['channelID']) {
        // Check for existing channel (active or archived)
        const existingChannel = await client.models['temp-channels']['TempChannel'].findOne({
            where: {creatorID: newState.member.user.id}
        });

        if (existingChannel) {
            // Restore from archive if needed
            if (existingChannel.archivedAt) {
                const dcChannel = await client.channels.fetch(existingChannel.id).catch(() => null);
                if (dcChannel) {
                    await dcChannel.setParent(moduleConfig['category'] || null, {
                        lockPermissions: false,
                        reason: '[temp-channels] Restoring archived channel'
                    }).catch(() => {
                    });
                    // Re-apply permissions based on saved mode
                    if (!existingChannel.isPublic) {
                        await dcChannel.permissionOverwrites.create(dcChannel.guild.roles.everyone, {
                            'CONNECT': false,
                            'VIEW_CHANNEL': false
                        });
                        await dcChannel.permissionOverwrites.create(dcChannel.guild.members.me, {
                            'CONNECT': true,
                            'VIEW_CHANNEL': true,
                            'MANAGE_CHANNELS': true
                        });
                        await dcChannel.permissionOverwrites.create(newState.member, {
                            'CONNECT': true,
                            'VIEW_CHANNEL': true,
                            'MANAGE_CHANNELS': moduleConfig['allowUserToChangeName']
                        });
                        const allowedUsers = (existingChannel.allowedUsers || '').split(',').filter(u => u && u !== newState.member.user.id);
                        for (const userId of allowedUsers) {
                            const member = newState.guild.members.cache.get(userId);
                            if (member) await dcChannel.permissionOverwrites.create(member, {
                                'CONNECT': true,
                                'VIEW_CHANNEL': true
                            }).catch(() => {
                            });
                        }
                        for (const roleId of (moduleConfig['privateBypassRoles'] || [])) {
                            await dcChannel.permissionOverwrites.create(roleId, {
                                'CONNECT': true,
                                'VIEW_CHANNEL': true
                            }).catch(() => {
                            });
                        }
                    } else {
                        await dcChannel.lockPermissions().catch(() => {
                        });
                        await dcChannel.permissionOverwrites.create(dcChannel.guild.members.me, {
                            'CONNECT': true,
                            'VIEW_CHANNEL': true,
                            'MANAGE_CHANNELS': true
                        });
                        if (moduleConfig['allowUserToChangeName']) await dcChannel.permissionOverwrites.create(newState.member, {'MANAGE_CHANNELS': true});
                    }
                    if (existingChannel.noMicChannel) {
                        const noMicChannel = await client.channels.fetch(existingChannel.noMicChannel).catch(() => null);
                        if (noMicChannel) {
                            await noMicChannel.setParent(moduleConfig['category'] || null, {
                                lockPermissions: false,
                                reason: '[temp-channels] Restoring archived no-mic channel'
                            }).catch(() => {
                            });
                        }
                    }
                    existingChannel.archivedAt = null;
                    await existingChannel.save();
                    return newState.setChannel(dcChannel.id, '[temp-channels] ' + localize('temp-channels', 'move-audit-log-reason'));
                } else {
                    await existingChannel.destroy();
                }
            } else {
                // Active channel exists, move user there
                return newState.setChannel(existingChannel.id, '[temp-channels] ' + localize('temp-channels', 'move-audit-log-reason')).catch(() => {
                    newState.setChannel(null, '[temp-channels] ' + localize('temp-channels', 'disconnect-audit-log-reason'));
                    existingChannel.destroy();
                });
            }
        }

        // Channel limit check
        if (moduleConfig.enableMaxActiveChannels && moduleConfig.maxActiveChannels > 0) {
            const activeCount = await client.models['temp-channels']['TempChannel'].count({where: {archivedAt: null}});
            if (activeCount >= moduleConfig.maxActiveChannels) {
                await newState.setChannel(null, '[temp-channels] Channel limit reached').catch(() => {
                });
                if (moduleConfig.maxActiveChannelsMessage) {
                    await newState.member.user.send(embedType(moduleConfig.maxActiveChannelsMessage, {})).catch(() => {
                    });
                }
                return;
            }
        }

        // Create new channel
        const n = await client.models['temp-channels']['TempChannel'].count({}) + 1;
        const newChannel = await newState.guild.channels.create({
            name: moduleConfig['channelname_format']
                .split('%username%').join(newState.member.user.username)
                .split('%number%').join(n)
                .split('%nickname%').join(newState.member.nickname || newState.member.user.username)
                .split('%tag%').join(formatDiscordUserName(newState.member.user)),
            type: ChannelType.GuildVoice,
            parent: moduleConfig['category'],
            reason: '[temp-channels] ' + localize('temp-channels', 'created-audit-log-reason', {u: formatDiscordUserName(newState.member.user)})
        });
        await newState.setChannel(newChannel.id);
        if (moduleConfig['allowUserToChangeName']) await newChannel.permissionOverwrites.create(newState.member, {'MANAGE_CHANNELS': true}, {
            reason: '[temp-channels] ' + localize('temp-channels', 'created-audit-log-reason', {u: formatDiscordUserName(newState.member.user)})
        });
        if (moduleConfig['send_dm']) await newState.member.user.send(embedType(moduleConfig['dm'], {'%channelname%': newChannel.name})).catch(() => {
        });

        let noMicChannel = null;
        if (moduleConfig['create_no_mic_channel']) {
            const everyoneRole = await newChannel.guild.roles.cache.find(role => role.name === '@everyone');
            noMicChannel = await newChannel.guild.channels.create({
                name: `${newChannel.name}-no-mic`,
                type: ChannelType.GuildText,
                parent: moduleConfig['category'],
                topic: localize('temp-channels', 'no-mic-channel-topic', {u: formatDiscordUserName(newState.member.user)}),
                reason: '[temp-channels] ' + localize('temp-channels', 'created-audit-log-reason', {u: formatDiscordUserName(newState.member.user)}),
                permissionOverwrites: [{
                    id: everyoneRole,
                    deny: ['VIEW_CHANNEL']
                }]
            });
            await noMicChannel.permissionOverwrites.create(newState.member, {'VIEW_CHANNEL': true}, {
                reason: '[temp-channels] ' + localize('temp-channels', 'created-audit-log-reason', {u: formatDiscordUserName(newState.member.user)})
            });
            await noMicChannel.send(embedType(moduleConfig['noMicChannelMessage'])).then(m => m.pin());
            if (moduleConfig['useNoMic']) await sendMessage(noMicChannel);
        }

        // Apply private permissions if default is private
        if (!moduleConfig['publicChannels']) {
            await newChannel.permissionOverwrites.create(newState.guild.roles.everyone, {
                'CONNECT': false,
                'VIEW_CHANNEL': false
            }, {
                reason: '[temp-channels] ' + localize('temp-channels', 'permission-update-audit-log-reason')
            });
            await newChannel.permissionOverwrites.create(newState.guild.members.me, {
                'CONNECT': true,
                'VIEW_CHANNEL': true,
                'MANAGE_CHANNELS': true
            }, {
                reason: '[temp-channels] ' + localize('temp-channels', 'permission-update-audit-log-reason')
            });
            await newChannel.permissionOverwrites.create(newState.member, {
                'CONNECT': true,
                'VIEW_CHANNEL': true,
                'MANAGE_CHANNELS': moduleConfig['allowUserToChangeName']
            }, {
                reason: '[temp-channels] ' + localize('temp-channels', 'permission-update-audit-log-reason')
            });
            for (const roleId of (moduleConfig['privateBypassRoles'] || [])) {
                await newChannel.permissionOverwrites.create(roleId, {
                    'CONNECT': true,
                    'VIEW_CHANNEL': true
                }, {reason: '[temp-channels] Private bypass role'}).catch(() => {
                });
            }
        }

        await client.models['temp-channels']['TempChannel'].create({
            creatorID: newState.member.user.id,
            id: newChannel.id,
            noMicChannel: noMicChannel ? noMicChannel.id : null,
            allowedUsers: newState.member.user.id,
            isPublic: moduleConfig['publicChannels']
        });
        if (moduleConfig['useNoMic'] && !moduleConfig['create_no_mic_channel']) await sendMessage(newChannel);
    }
};