const {runJoinGate} = require('./guildMemberAdd');
module.exports.run = async function (client, oldGuildMember, newGuildMember) {
    if (!client.botReadyAt) return;
    const joinGateConfig = client.configurations['moderation']['joinGate'];
    const verificationConfig = client.configurations['moderation']['verification'];

    if (oldGuildMember.pending && !newGuildMember.pending && joinGateConfig.enabled && !['kick', 'ban'].includes(joinGateConfig.action)) {
        await runJoinGate(newGuildMember);
    }
};