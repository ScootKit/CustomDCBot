const {generateGiveawayEmbed} = require('../birthday');
const schedule = require('node-schedule');

module.exports.run = async function (client) {
    await generateGiveawayEmbed(client);
    schedule.scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_*
        await generateGiveawayEmbed(client, true);
    });
};