const {embedType, disableModule, formatDiscordUserName} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

const userCooldown = new Set(); // Per-user cooldown (legacy)
const channelCooldown = new Map(); // Per-channel cooldown: Map<channelId, timestamp>

exports.run = async (client, oldState, newState) => {
    if (!client.botReadyAt) return;
    const roleConfig = client.configurations['ping-on-vc-join']['actual-config'];

    if (roleConfig.assignRoleToUsersInVoiceChannels && roleConfig.voiceRoles.length !== 0 && !newState.member.user.bot) {
        if (oldState.channel && !newState.channel) newState.member.roles.remove(roleConfig.voiceRoles);
        if (!oldState.channel && newState.channel) newState.member.roles.add(roleConfig.voiceRoles);
    }

    if (!newState.channel || newState.channel.id === oldState?.channel?.id) return;
    const channel = await client.channels.fetch(newState.channelId);
    if (channel.guild.id !== client.guild.id) return;

    const moduleConfig = client.configurations['ping-on-vc-join']['config'];

    const configElement = moduleConfig.find(e => e.channels.includes(channel.id));
    if (!configElement) return;
    const member = await client.guild.members.fetch(newState.id);
    if (member.user.bot) return;

    const cooldownEnabled = configElement['cooldownEnabled'] || false;

    if (cooldownEnabled) {
        const cooldownKey = `${channel.id}`;
        const now = Date.now();
        const cooldownEnd = channelCooldown.get(cooldownKey);

        if (cooldownEnd && now < cooldownEnd) {
            return;
        }
    } else {
        if (userCooldown.has(member.user.id)) return;
    }

    const notifyChannel = newState.guild.channels.cache.get(configElement['notify_channel_id']);
    if (!notifyChannel) return disableModule('ping-on-vc-join', localize('ping-on-vc-join', 'channel-not-found', {c: configElement['notify_channel_id']}));

    setTimeout(async () => { // Wait 3 seconds before pinging a role
        if (!member.voice) return;
        if (member.voice.channelId !== channel.id) return;

        await notifyChannel.send(embedType(configElement['message'], {
            '%vc%': channel.name,
            '%tag%': formatDiscordUserName(member.user),
            '%mention%': `<@${member.user.id}>`
        }));

        if (cooldownEnabled) {
            const cooldownMinutes = configElement['cooldownMinutes'] || 5;
            const cooldownMs = cooldownMinutes * 60 * 1000;
            const cooldownKey = `${channel.id}`;

            channelCooldown.set(cooldownKey, Date.now() + cooldownMs);

            setTimeout(() => {
                const now = Date.now();
                if (channelCooldown.get(cooldownKey) <= now) {
                    channelCooldown.delete(cooldownKey);
                }
            }, cooldownMs);
        } else {
            userCooldown.add(member.user.id);
            setTimeout(() => {
                userCooldown.delete(member.user.id);
            }, 300000); // 5 min
        }

        if (configElement['send_pn_to_member']) {
            await member.send(embedType(configElement['pn_message'], {
                '%vc%': channel.name
            })).catch(() => {
                client.logger.info(`[ping-on-vc-join] ` + localize('ping-on-vc-join', 'could-not-send-pn', {m: member.user.id}));
            });
        }
    }, 3000);
};