const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (client) {
    const channels = client.configurations['auto-delete']['channels'];
    const voiceChannels = client.configurations['auto-delete']['voice-channels'];

    const uniqueConfigChannels = findUniqueChannels(channels);
    const uniqueConfigVoiceChannels = findUniqueChannels(voiceChannels);

    client.modules['auto-delete'].uniqueChannels = uniqueConfigChannels.filter((channel) => {
        const channelConfigObject = uniqueConfigVoiceChannels.find((voiceChannel) => voiceChannel.channelID === channel.channelID);
        return !channelConfigObject;
    });

    for (const channel of client.modules['auto-delete'].uniqueChannels) {
        if (!channel.purgeOnStart) continue;
        const dcChannel = await client.channels.fetch(channel.channelID).catch(() => {});
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

/**
 * Finds and deletes duplicates in Array (Last Writer wins)
 * @param {String} arrayToFilter Array of Channels
 * @returns {Array} Filtered Array of Channels
 * @private
 */
function findUniqueChannels(arrayToFilter) {
    const uniqueConfigChannelIds = {};

    for (let i = 0; i < arrayToFilter.length; i++) {
        uniqueConfigChannelIds[arrayToFilter[i].channelID] = i;
    }

    return arrayToFilter.filter((channel, index) => uniqueConfigChannelIds[channel.channelID] === index);
}