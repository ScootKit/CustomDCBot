const {ChannelType} = require('discord.js');
const {grantXPAndLevelUP} = require('./messageCreate');
const states = new Map();

async function startVoiceSession(client, currentState) {
    const moduleConfig = client.configurations['levels']['config'];
    if (moduleConfig.blacklisted_channels.includes(currentState.channel.id) || moduleConfig.blacklisted_channels.includes(currentState.channel.parentId)) return;

    const int = setInterval(() => {
        grantXP(client, currentState?.member).then(() => {
        });
    }, 1000 * 60 * 15);

    states.set(currentState.member.id, {
        start: new Date(),
        channel: currentState.channel,
        lastXPTime: new Date(),
        end: null,
        interval: int
    });
}

async function endVoiceSession(client, currentState) {
    if (!states.has(currentState.member.id)) return;
    const oldState = states.get(currentState.member.id);
    clearInterval(oldState.interval);
    states.delete(currentState.member.id);
    await grantXP(client, currentState.member);
}

async function grantXP(client, member) {
    const stateData = states.get(member?.id);
    if (!stateData) return;
    const diff = new Date().getTime() - stateData.lastXPTime.getTime();
    stateData.lastXPTime = new Date();
    const moduleConfig = client.configurations['levels']['config'];
    const timeInMinutes = (diff / (1000 * 60));
    const xp = Math.round(moduleConfig['voiceXPPerMinute'] * timeInMinutes);
    await grantXPAndLevelUP(client, member, xp, 'voice', stateData.channel);
}

module.exports.run = async function (client, oldState, newState) {
    if (!client.botReadyAt) return;
    if (!newState.guild || newState.member.user.bot) return;
    if (newState.guild.id !== client.guildID || client.configurations['levels']['config']['voiceXPPerMinute'] === 0) return;

    if (newState.channel && (client.configurations['levels']['config'].blacklisted_channels.includes(newState.channel.id) || client.configurations['levels']['config'].blacklisted_channels.includes(newState.channel.parentId) || client.configurations['levels']['config'].blacklisted_channels.includes(newState.channel.parent?.parentId))) return;
    if (newState.member.roles.cache.filter(r => client.configurations['levels']['config'].blacklistedRoles.includes(r.id)).size !== 0) return;

    if (oldState.channel !== newState.channel || oldState.deaf !== newState.deaf || oldState.mute !== newState.mute) await endVoiceSession(client, newState);

    if (newState.channel && !newState.deaf && !newState.mute && newState.channel.type !== ChannelType.GuildStageVoice) await startVoiceSession(client, newState);
};