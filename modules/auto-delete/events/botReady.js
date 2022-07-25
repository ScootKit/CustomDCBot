const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (client) {
    const channels = client.configurations['auto-delete']['channels'];
    for (const channel of channels) {
        if (!channel.purgeOnStart) continue;
        const dcChannel = await client.channels.fetch(channel.channelID).catch(() => {
        });
        if (!dcChannel) return client.logger.error(`[auto-delete] ${localize('auto-delete', 'could-not-fetch-channel', {c: channel.channelID})}`);
        dcChannel.bulkDelete((await dcChannel.messages.fetch()).filter(m => !m.pinned && m.deletable), true);
    }
};