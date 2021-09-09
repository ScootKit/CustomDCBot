const {endGiveaway} = require('../giveaways');
const {scheduleJob} = require('node-schedule');

module.exports.run = async (client) => {
    const giveaways = await client.models['giveaways']['Giveaway'].findAll({
        where: {
            ended: false
        }
    });
    for (const g of giveaways) {
        if (parseInt(g.endAt) < new Date().getTime()) {
            await endGiveaway(g.id, null, true);
            continue;
        }
        const job = scheduleJob(new Date(parseInt(g.endAt)), async () => {
            await endGiveaway(g.id, job, true);
        });
        client.jobs.push(job);
    }
};