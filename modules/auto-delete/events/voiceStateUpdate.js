const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (client, oldState) {
    if (!client.botReadyAt) return;

    const voiceChannels = client.configurations['auto-delete']['voice-channels'];

    const channelConfigEntry = voiceChannels.find((vc) => oldState.channelId === vc.channelID);
    if (!channelConfigEntry) return;

    const channel = await client.channels.fetch(channelConfigEntry.channelID).catch(()=>{});
    if (!channel) {
        return client.logger.error(`[auto-delete] ${localize('auto-delete', 'could-not-fetch-channel', {c: channelConfigEntry.channelID})}`);
    }
    if (channel.members.size === 0) return;

    const channelMessages = await channel.messages.fetch().catch(()=> {});
    if(!channelMessages){
        return client.logger.error(`[auto-delete] ${localize('auto-delete', 'could-not-fetch-messages', {c: channelConfigEntry.channelID})}`);
    }
    if(channelMessages.size === 0) return;

    setTimeout(async() => {
        channel.bulkDelete(await channel.messages.fetch(), true).catch(() => {});
    }, parseInt(channelConfigEntry.timeout * 1000 * 60));
};