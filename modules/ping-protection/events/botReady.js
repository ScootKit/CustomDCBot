const { enforceRetention, syncNativeAutoMod } = require('../ping-protection');
const schedule = require('node-schedule');

module.exports.run = async function (client) {
    await enforceRetention(client);
    await syncNativeAutoMod(client);

    // Daily job
    const job = schedule.scheduleJob('0 3 * * *', async () => {
        await enforceRetention(client);
        await syncNativeAutoMod(client);
    });
    client.jobs.push(job);
};