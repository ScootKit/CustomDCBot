const {endGiveaway} = require('../giveaways');
const {scheduleJob} = require('node-schedule');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async (client) => {
    // Migration
    const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({where: {model: 'giveaways_Giveaway'}});
    if (!dbVersion) {
        client.logger.info('[giveaways] ' + localize('giveaways', 'migration-happening'));
        await client.models['giveaways']['Giveaway'].sync({force: true});
        client.logger.info('[giveaways] ' + localize('giveaways', 'migration-done'));
        await client.models['DatabaseSchemeVersion'].create({model: 'giveaways_Giveaway', version: 'V1'});
    }

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