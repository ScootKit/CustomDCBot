const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (client, oldState) {
    if (!client.botReadyAt) return;

    const voiceChannels = client.configurations['auto-delete']['voice-channels'];

    const channelConfigEntry = {...voiceChannels.find((vc) => oldState.channelId === vc.channelID)};
    if (!channelConfigEntry.channelID) return;

    const channel = await client.channels.fetch(channelConfigEntry.channelID);
    if (!channel) {
        return client.logger.error(`[auto-delete] ${localize('auto-delete', 'could-not-fetch-channel', {c: channel.channelID})}`);
    }
    if (channel.members.size) return;

    setTimeout(async() => {
        channel.bulkDelete(await channel.messages.fetch(), true).catch(() => {});
    }, parseInt(channelConfigEntry.timeout * 1000 * 60));
};