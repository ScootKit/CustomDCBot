const {generateBirthdayEmbed} = require('../birthday');
const schedule = require('node-schedule');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client) {
    // Migration
    const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({where: {model: 'birthday_User'}});
    if (!dbVersion) {
        client.logger.info('[birthdays] ' + localize('birthdays', 'migration-happening'));
        const data = await client.models['birthday']['User'].findAll({attributes: ['id', 'month', 'day', 'year', 'sync']});
        await client.models['birthday']['User'].sync({force: true});
        for (const user of data) {
            await client.models['birthday']['User'].create(user);
        }
        client.logger.info('[giveaways] ' + localize('birthdays', 'migration-done'));
        await client.models['DatabaseSchemeVersion'].create({model: 'birthday_User', version: 'V1'});
    }

    await generateBirthdayEmbed(client);
    const job = schedule.scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_*
        await generateBirthdayEmbed(client, true);
    });
    client.jobs.push(job);
};