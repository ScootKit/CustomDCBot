const {ChannelType} = require('discord.js');
const {grantXPAndLevelUP} = require('./messageCreate');
const states = new Map();

function isChannelBlacklisted(client, channel) {
    if (!channel) return true;
    const blacklist = client.configurations['levels']['config'].blacklisted_channels;
    return blacklist.includes(channel.id) || blacklist.includes(channel.parentId) || blacklist.includes(channel.parent?.parentId);
}

function isRoleBlacklisted(client, member) {
    return member.roles.cache.some(r => client.configurations['levels']['config'].blacklistedRoles.some(br => String(br) === r.id));
}

function hasHumanCompany(channel) {
    if (!channel) return false;
    return channel.members.filter(m => !m.user.bot).size >= 2;
}

function isEligible(client, voiceState) {
    if (!voiceState || !voiceState.channel) return false;
    if (!voiceState.member || voiceState.member.user.bot) return false;
    if (voiceState.deaf || voiceState.mute) return false;
    if (voiceState.channel.type === ChannelType.GuildStageVoice) return false;
    if (isChannelBlacklisted(client, voiceState.channel)) return false;
    if (isRoleBlacklisted(client, voiceState.member)) return false;
    if (!hasHumanCompany(voiceState.channel)) return false;
    return true;
}

async function startVoiceSession(client, voiceState) {
    if (states.has(voiceState.member.id)) return;

    const int = setInterval(() => {
        grantXP(client, voiceState?.member).then(() => {
        });
    }, 1000 * 60 * 15);

    states.set(voiceState.member.id, {
        start: new Date(),
        channel: voiceState.channel,
        lastXPTime: new Date(),
        end: null,
        interval: int
    });
}

async function endVoiceSession(client, member) {
    if (!states.has(member.id)) return;
    const oldState = states.get(member.id);
    clearInterval(oldState.interval);
    states.delete(member.id);
    await grantXP(client, member, oldState);
}

async function grantXP(client, member, overrideStateData) {
    const stateData = overrideStateData || states.get(member?.id);
    if (!stateData) return;
    if (isRoleBlacklisted(client, member)) {
        if (states.has(member.id)) {
            clearInterval(states.get(member.id).interval);
            states.delete(member.id);
        }
        return;
    }
    const diff = new Date().getTime() - stateData.lastXPTime.getTime();
    stateData.lastXPTime = new Date();
    const moduleConfig = client.configurations['levels']['config'];
    const timeInMinutes = (diff / (1000 * 60));
    const xp = Math.round(moduleConfig['voiceXPPerMinute'] * timeInMinutes);
    await grantXPAndLevelUP(client, member, xp, 'voice', stateData.channel);
}

async function updateChannelSessions(client, channel) {
    if (!channel) return;
    for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        const voiceState = member.voice;
        if (isEligible(client, voiceState)) {
            if (!states.has(member.id)) await startVoiceSession(client, voiceState);
        } else if (states.has(member.id)) {
            await endVoiceSession(client, member);
        }
    }
}

module.exports.run = async function (client, oldState, newState) {
    if (!client.botReadyAt) return;
    if (!newState.guild || newState.member.user.bot) return;
    if (newState.guild.id !== client.guildID || client.configurations['levels']['config']['voiceXPPerMinute'] === 0) return;

    const channelChanged = oldState.channel !== newState.channel;
    const muteOrDeafChanged = oldState.deaf !== newState.deaf || oldState.mute !== newState.mute;
    if (!channelChanged && !muteOrDeafChanged) return;

    if (states.has(newState.member.id)) await endVoiceSession(client, newState.member);

    if (oldState.channel && oldState.channel !== newState.channel) await updateChannelSessions(client, oldState.channel);
    if (newState.channel) await updateChannelSessions(client, newState.channel);
};
