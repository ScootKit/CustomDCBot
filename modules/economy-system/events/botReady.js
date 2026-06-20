const {createLeaderboard, shopMsg} = require('../economy-system');
const schedule = require('node-schedule');

module.exports.run = async function (client) {
    await shopMsg(client);
    await createLeaderboard(client);
    const job = schedule.scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_
        await createLeaderboard(client);
    });
    client.jobs.push(job);
};
