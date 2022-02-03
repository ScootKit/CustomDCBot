const {createleaderboard} = require('../economy-system');
const schedule = require('node-schedule');

module.exports.run = async function (client) {
    await createleaderboard(client);
    const job = schedule.scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_
        await createleaderboard(client);
    });
    client.jobs.push(job);
};