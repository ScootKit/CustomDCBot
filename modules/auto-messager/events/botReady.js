const schedule = require('node-schedule');
const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client) {
    const hourly = client.configurations['auto-messager']['hourly'];
    const hourlyJob = schedule.scheduleJob('1 * * * *', async () => {
        for (const obj of hourly) {
            obj.limitHoursTo = obj.limitHoursTo.map(Number);
            if (obj.limitHoursTo.length !== 0 && !obj.limitHoursTo.includes(new Date().getHours())) continue;
            const c = client.channels.cache.get(obj.channelID);
            if (!c) {
                client.logger.error(`[auto-messager] ${localize('auto-messager', 'channel-not-found', {id: obj.channelID})}`);
                continue;
            }
            await c.send(embedType(obj.message));
        }
    });
    client.jobs.push(hourlyJob);

    const daily = client.configurations['auto-messager']['daily'];
    const dailyJob = schedule.scheduleJob('1 6 * * *', async () => {
        for (const obj of daily) {
            obj.limitWeekDaysTo = obj.limitWeekDaysTo.map(Number);
            obj.limitDaysTo = obj.limitDaysTo.map(Number);
            if (obj.limitWeekDaysTo.length !== 0 && !obj.limitWeekDaysTo.includes(new Date().getDay() + 1)) continue;
            if (obj.limitDaysTo.length !== 0 && !obj.limitDaysTo.includes(new Date().getDate())) continue;
            const c = client.channels.cache.get(obj.channelID);
            if (!c) {
                client.logger.error(`[auto-messager] ${localize('auto-messager', 'channel-not-found', {id: obj.channelID})}`);
                continue;
            }
            await c.send(embedType(obj.message));
        }
    });
    client.jobs.push(dailyJob);

    const cronjob = client.configurations['auto-messager']['cronjob'];
    for (const job of cronjob) {
        client.jobs.push(schedule.scheduleJob(job.expression, async () => {
            const c = client.channels.cache.get(job.channelID);
            if (!c) {
                return client.logger.error(`[auto-messager] ${localize('auto-messager', 'channel-not-found', {id: obj.channelID})}`);
            }
            await c.send(embedType(job.message));
        }));
    }
};