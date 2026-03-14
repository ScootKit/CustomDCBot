const {migrate} = require('../../../src/functions/helpers');
const {client} = require('../../../main');
const {sendMessage} = require('../channel-settings');
const {localize} = require('../../../src/functions/localize');
module.exports.run = async function () {
    const settingsChannel = client.channels.cache.get(client.configurations['temp-channels']['config']['settingsChannel']);
    await migrate('temp-channels', 'TempChannelV1', 'TempChannel');

    // Cleanup orphaned temp channels on startup
    const tempChannels = await client.models['temp-channels']['TempChannel'].findAll();
    let cleanedCount = 0;
    for (const tempChannel of tempChannels) {
        try {
            const dcChannel = await client.channels.fetch(tempChannel.id).catch(() => null);

            if (!dcChannel) {
                await tempChannel.destroy();
                cleanedCount++;
                continue;
            }

            if (dcChannel.members.size === 0) {
                await dcChannel.delete(`[temp-channels] ${localize('temp-channels', 'removed-audit-log-reason')}`).catch(() => {});
                await tempChannel.destroy();
                cleanedCount++;
            }
        } catch (error) {
            client.logger.warn(`[temp-channels] Failed to cleanup channel ${tempChannel.id}: ${error.message}`);
        }
    }

    if (cleanedCount > 0) {
        client.logger.info(`[temp-channels] Cleaned up ${cleanedCount} empty or orphaned temp channel(s) on startup`);
    }

    if (settingsChannel) {
        await sendMessage(settingsChannel);
    }
};