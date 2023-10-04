const { Op } = require('sequelize');
const schedule = require('node-schedule');

module.exports.run = async function (client) {
    const job = schedule.scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_
        client.models['starboard']['StarUser'].destroy({
            where: {
                createdAt: {
                    [Op.lt]: Date.now() - 1000 * 60 * 60
                }
            }
        });
    });
    client.jobs.push(job);
};
