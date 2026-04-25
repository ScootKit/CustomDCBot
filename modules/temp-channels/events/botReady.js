const {migrate} = require('../../../src/functions/helpers');
const {client} = require('../../../main');
const {
    migrationStart,
    migrationEnd
} = require('../../../main');
const {sendMessage} = require('../channel-settings');
const {localize} = require('../../../src/functions/localize');
const {scheduleJob} = require('node-schedule');
const {Op} = require('sequelize');

module.exports.run = async function () {
    const moduleConfig = client.configurations['temp-channels']['config'];
    const settingsChannel = client.channels.cache.get(moduleConfig['settingsChannel']);
    await migrate('temp-channels', 'TempChannelV1', 'TempChannel');

    // Migration V2: add archivedAt column
    const dbVersionV2 = await client.models['DatabaseSchemeVersion'].findOne({
        where: {
            model: 'temp-channels_TempChannel',
            version: 'V2'
        }
    });
    if (!dbVersionV2) {
        migrationStart();
        try {
            client.logger.info('[temp-channels] Running V2 migration (adding archivedAt field)...');
            const data = await client.models['temp-channels']['TempChannel'].findAll({
                attributes: ['id', 'creatorID', 'noMicChannel', 'allowedUsers', 'isPublic']
            }).catch(() => []);
            await client.models['temp-channels']['TempChannel'].sync({force: true});
            for (const tc of data) {
                await client.models['temp-channels']['TempChannel'].create({
                    id: tc.id,
                    creatorID: tc.creatorID,
                    noMicChannel: tc.noMicChannel,
                    allowedUsers: tc.allowedUsers,
                    isPublic: tc.isPublic,
                    archivedAt: null
                });
            }
            client.logger.info('[temp-channels] V2 migration complete.');
            await client.models['DatabaseSchemeVersion'].upsert({
                model: 'temp-channels_TempChannel',
                version: 'V2'
            });
        } finally {
            migrationEnd();
        }
    }

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

            // Skip archived channels — they're supposed to be empty
            if (tempChannel.archivedAt) continue;

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

    // Schedule archive cleanup job (every hour)
    if (moduleConfig.enableArchiving && moduleConfig.archiveDeleteAfterHours > 0) {
        const archiveCleanupJob = scheduleJob('0 * * * *', async () => {
            const cutoff = new Date(Date.now() - moduleConfig.archiveDeleteAfterHours * 3600000);
            const expiredChannels = await client.models['temp-channels']['TempChannel'].findAll({
                where: {
                    archivedAt: {
                        [Op.ne]: null,
                        [Op.lt]: cutoff
                    }
                }
            });
            for (const tc of expiredChannels) {
                try {
                    const dcChannel = await client.channels.fetch(tc.id).catch(() => null);
                    if (dcChannel) await dcChannel.delete('[temp-channels] Archived channel expired').catch(() => {
                    });
                    if (tc.noMicChannel) {
                        const noMic = await client.channels.fetch(tc.noMicChannel).catch(() => null);
                        if (noMic) await noMic.delete('[temp-channels] Archived no-mic channel expired').catch(() => {
                        });
                    }
                    await tc.destroy();
                } catch (e) {
                    client.logger.warn(`[temp-channels] Failed to delete expired archive ${tc.id}: ${e.message}`);
                }
            }
            if (expiredChannels.length > 0) client.logger.info(`[temp-channels] Deleted ${expiredChannels.length} expired archived channel(s)`);
        });
        client.jobs.push(archiveCleanupJob);
    }

    if (settingsChannel) {
        await sendMessage(settingsChannel);
    }
};