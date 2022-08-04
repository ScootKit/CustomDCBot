const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (client) {
    const channels = client.configurations['auto-delete']['channels'];
    const voiceChannels = client.configurations['auto-delete']['voice-channels'];
    const uniqueConfigVoiceChannels = findUniqueChannels(voiceChannels);
        if (!channel.purgeOnStart) continue;
        const dcChannel = await client.channels.fetch(channel.channelID).catch(() => {
        });
        if (!dcChannel) return client.logger.error(`[auto-delete] ${localize('auto-delete', 'could-not-fetch-channel', {c: channel.channelID})}`);
        dcChannel.bulkDelete((await dcChannel.messages.fetch()).filter(m => !m.pinned && m.deletable), true);
    }

    for (const voiceChannel of uniqueConfigVoiceChannels) {
        if (!voiceChannel.purgeOnStart) continue;

        const dcVoiceChannel = await client.channels.fetch(voiceChannel.channelID).catch(() => {});
        if (dcVoiceChannel.members.size) return;
        if (!dcVoiceChannel) return client.logger.error(`[auto-delete] ${localize('auto-delete', 'could-not-fetch-channel', {c: voiceChannel.channelID})}`);

        dcVoiceChannel.bulkDelete(await dcVoiceChannel.messages.fetch(), true);
    }
};