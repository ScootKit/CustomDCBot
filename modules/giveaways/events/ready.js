const {endGiveaway} = require('../giveaways');
const {scheduleJob} = require('node-schedule');

module.exports.run = async (client) => {
    const giveaways = await client.models['giveaways']['Giveaway'].findAll({
        where: {
            ended: false
        }
    });
    giveaways.forEach(g => {
        scheduleJob(new Date(parseInt(g.endAt)), async () => {
            await endGiveaway(g.id);
        });
    })
};