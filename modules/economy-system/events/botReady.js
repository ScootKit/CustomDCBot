const {createleaderboard} = require('../economy-system');
const schedule = require('node-schedule');

module.exports.run = async function (client) {
    // Migration
    const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({where: {model: 'economy_User'}});
    if (!dbVersion) {
        client.logger.info('[economy-system] ' + localize('economy-system', 'migration-happening'));
        const data = await client.models['economy-system']['Balance'].findAll({attributes: ['id', 'balance']});
        await client.models['economy-system']['Balance'].sync({force: true});
        for (const user of data) {
            await client.models['economy-system']['Balance'].create(user);
        }
        client.logger.info('[economy-system] ' + localize('economy-system', 'migration-done'));
        await client.models['DatabaseSchemeVersion'].create({model: 'economy_User', version: 'V1'});
    }
    await createleaderboard(client);
    const job = schedule.scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_
        await createleaderboard(client);
    });
    client.jobs.push(job);
};