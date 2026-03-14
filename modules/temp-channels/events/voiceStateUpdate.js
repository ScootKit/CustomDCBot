const {embedType} = require('./../../../src/functions/helpers');
const {Op} = require('sequelize');
const {localize} = require('../../../src/functions/localize');
const {sendMessage} = require('../channel-settings');
const {formatDiscordUserName} = require('../../../src/functions/helpers');
const {ChannelType} = require('discord.js');

module.exports.run = async function (client, oldState, newState) {
    if (!client.botReadyAt) return;
    const moduleConfig = client.configurations['temp-channels']['config'];

    if (oldState.channel) {
        const oldChannel = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                id: oldState.channel.id
            }
        });
        if (oldChannel) {
            setTimeout(async () => {
                try {
                    const dcOldChannel = await client.channels.fetch(oldChannel.id).catch(() => null);
                    if (dcOldChannel && dcOldChannel.members.size === 0) {
                        if (oldChannel.noMicChannel) {
                            const noMicChannel = await client.channels.fetch(oldChannel.noMicChannel).catch(() => null);
                            if (noMicChannel) {
                                await noMicChannel.delete(`[temp-channels] ${localize('temp-channels', 'removed-audit-log-reason')}`).catch((e) => {
                                    client.logger.warn(`[temp-channels] Failed to delete no-mic channel ${oldChannel.noMicChannel}: ${e.message}`);
                                });
                            }
                        }
                        await dcOldChannel.delete(`[temp-channels] ${localize('temp-channels', 'removed-audit-log-reason')}`).catch((e) => {
                            client.logger.warn(`[temp-channels] Failed to delete temp channel ${oldChannel.id}: ${e.message}`);
                        });
                        await oldChannel.destroy();
                    } else if (!dcOldChannel) {
                        await oldChannel.destroy();
                    }
                } catch (error) {
                    client.logger.warn(`[temp-channels] Error during channel cleanup: ${error.message}`);
                }
            }, moduleConfig['timeout'] * 1000);
        }
    }

    if (moduleConfig['create_no_mic_channel']) {
        const possibleExistingChannel = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                [Op.or]: [
                    {id: newState.channel ? newState.channel.id : false},
                    {id: oldState.channel ? oldState.channel.id : false}
                ]
            }
        });
        if (possibleExistingChannel) {
            const existingNoMicChannel = await newState.guild.channels.cache.get(possibleExistingChannel.noMicChannel);
            if (existingNoMicChannel) await existingNoMicChannel.permissionOverwrites.create(newState.member, {
                'VIEW_CHANNEL': newState.channel && newState.channel.id === possibleExistingChannel.id
            }, {reason: '[temp-channels] ' + localize('temp-channels', 'permission-update-audit-log-reason')});
        }
    }

    if (!newState.channel) return;

    if (newState.channel.id === moduleConfig['channelID']) {
        const alreadyExistingChannel = await client.models['temp-channels']['TempChannel'].findOne({
            where: {
                creatorID: newState.member.user.id
            }
        });
        if (alreadyExistingChannel) return newState.setChannel(alreadyExistingChannel.id, `[temp-channels] ` + localize('temp-channels', 'move-audit-log-reason')).catch(() => {
            newState.setChannel(null, '[temp-channels] ' + localize('temp-channels', 'disconnect-audit-log-reason'));
            alreadyExistingChannel.destroy();
        });
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
                permissionOverwrites: [
                    {
                        id: everyoneRole,
                        deny: ['VIEW_CHANNEL']
                    }
                ]
            });
            await noMicChannel.permissionOverwrites.create(newState.member, {
                'VIEW_CHANNEL': true
            }, {
                reason: '[temp-channels] ' + localize('temp-channels', 'created-audit-log-reason', {u: formatDiscordUserName(newState.member.user)})
            });
            await noMicChannel.send(embedType(moduleConfig['noMicChannelMessage'])).then(m => m.pin());
            if (moduleConfig['useNoMic']) {
                await sendMessage(noMicChannel);
            }
        }
        await client.models['temp-channels']['TempChannel'].create({
            creatorID: newState.member.user.id,
            id: newChannel.id,
            noMicChannel: noMicChannel ? noMicChannel.id : null,
            allowedUsers: newState.member.user.id,
            isPublic: moduleConfig['publicChannels']
        });
        if (moduleConfig['useNoMic']) {
            if (!moduleConfig['create_no_mic_channel']) {
                await sendMessage(newChannel);
            }
        }
    }
};