const schedule = require('node-schedule');
const {runSync} = require('../baseRoles');

const INITIAL_DELAY_MS = 60_000;
const SCHEDULE_NAME = 'welcomer-base-role-sync';
const SCHEDULE_CRON = '0 3 * * *';

module.exports.run = async (client) => {
    const config = client.configurations.welcomer.config;
    if (!config['treat-welcome-roles-as-base-roles']) return;

    setTimeout(() => {
        runSync(client).catch(e => {
            client.logger.error('[welcomer] Base-role initial sync failed: ' + (e && e.message ? e.message : String(e)));
            if (client.captureException) client.captureException(e, {
                module: 'welcomer',
                phase: 'base-role-initial-sync'
            });
        });
    }, INITIAL_DELAY_MS);

    if (schedule.scheduledJobs[SCHEDULE_NAME]) {
        schedule.scheduledJobs[SCHEDULE_NAME].cancel();
    }
    schedule.scheduleJob(SCHEDULE_NAME, SCHEDULE_CRON, () => {
        runSync(client).catch(e => {
            client.logger.error('[welcomer] Base-role daily sync failed: ' + (e && e.message ? e.message : String(e)));
            if (client.captureException) client.captureException(e, {
                module: 'welcomer',
                phase: 'base-role-daily-sync'
            });
        });
    });
};
