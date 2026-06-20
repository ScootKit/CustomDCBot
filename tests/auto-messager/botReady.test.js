/*
 * Tests for the auto-messager botReady scheduler (modules/auto-messager/events/botReady.js).
 *
 * The handler registers three kinds of scheduled jobs (hourly / daily / cronjob)
 * via node-schedule. node-schedule is mocked so we can capture each job's
 * callback and invoke it deterministically. Date is stubbed so the time-window
 * filters (limitHoursTo / limitWeekDaysTo / limitDaysTo) are testable.
 *
 * Covers:
 *   - all configured jobs are registered and pushed onto client.jobs
 *   - hourly limitHoursTo gating (send only in the allowed hour; empty = always)
 *   - daily limitWeekDaysTo / limitDaysTo gating
 *   - missing channel => logs an error instead of sending
 *   - cronjob jobs send to their configured channel
 */

const scheduledJobs = [];
jest.mock('node-schedule', () => ({
    scheduleJob: jest.fn((expr, cb) => {
        const job = {
            expr,
            cb,
            id: scheduledJobs.length
        };
        scheduledJobs.push(job);
        return job;
    })
}));

const schedule = require('node-schedule');
const botReady = require('../../modules/auto-messager/events/botReady.js');

function makeClient({
                        hourly = [],
                        daily = [],
                        cronjob = [],
                        channels = {}
                    } = {}) {
    return {
        configurations: {
            'auto-messager': {
                hourly,
                daily,
                cronjob
            }
        },
        channels: {
            cache: {get: (id) => channels[id]}
        },
        jobs: [],
        logger: {error: jest.fn()}
    };
}

function makeChannel() {
    return {send: jest.fn().mockResolvedValue()};
}

beforeEach(() => {
    scheduledJobs.length = 0;
    schedule.scheduleJob.mockClear();
});

function getJob(expr) {
    return scheduledJobs.find(j => j.expr === expr);
}

describe('job registration', () => {
    test('registers hourly, daily and each cronjob, pushing them onto client.jobs', async () => {
        const client = makeClient({
            hourly: [{
                channelID: 'h',
                message: 'hi',
                limitHoursTo: []
            }],
            daily: [{
                channelID: 'd',
                message: 'hi',
                limitWeekDaysTo: [],
                limitDaysTo: []
            }],
            cronjob: [
                {
                    expression: '* * * * *',
                    channelID: 'c1',
                    message: 'a'
                },
                {
                    expression: '0 0 * * *',
                    channelID: 'c2',
                    message: 'b'
                }
            ]
        });
        await botReady.run(client);

        expect(getJob('1 * * * *')).toBeDefined();   // hourly
        expect(getJob('1 6 * * *')).toBeDefined();    // daily
        expect(getJob('* * * * *')).toBeDefined();    // cronjob 1
        expect(getJob('0 0 * * *')).toBeDefined();    // cronjob 2
        // hourly + daily + 2 cron = 4 jobs tracked
        expect(client.jobs).toHaveLength(4);
    });
});

describe('hourly job limitHoursTo gating', () => {
    test('sends when the current hour is allowed', async () => {
        const channel = makeChannel();
        const client = makeClient({
            hourly: [{
                channelID: 'h',
                message: 'msg',
                limitHoursTo: ['9']
            }],
            channels: {h: channel}
        });
        await botReady.run(client);

        const spy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);
        try {
            await getJob('1 * * * *').cb();
        } finally {
            spy.mockRestore();
        }
        expect(channel.send).toHaveBeenCalledTimes(1);
    });

    test('does not send outside the allowed hour', async () => {
        const channel = makeChannel();
        const client = makeClient({
            hourly: [{
                channelID: 'h',
                message: 'msg',
                limitHoursTo: ['9']
            }],
            channels: {h: channel}
        });
        await botReady.run(client);

        const spy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
        try {
            await getJob('1 * * * *').cb();
        } finally {
            spy.mockRestore();
        }
        expect(channel.send).not.toHaveBeenCalled();
    });

    test('an empty limitHoursTo means send every hour', async () => {
        const channel = makeChannel();
        const client = makeClient({
            hourly: [{
                channelID: 'h',
                message: 'msg',
                limitHoursTo: []
            }],
            channels: {h: channel}
        });
        await botReady.run(client);

        const spy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(3);
        try {
            await getJob('1 * * * *').cb();
        } finally {
            spy.mockRestore();
        }
        expect(channel.send).toHaveBeenCalledTimes(1);
    });

    test('logs an error when the configured channel is missing', async () => {
        const client = makeClient({
            hourly: [{
                channelID: 'gone',
                message: 'msg',
                limitHoursTo: []
            }],
            channels: {}
        });
        await botReady.run(client);
        await getJob('1 * * * *').cb();
        expect(client.logger.error).toHaveBeenCalledTimes(1);
    });
});

describe('daily job gating', () => {
    test('respects limitWeekDaysTo (getDay()+1)', async () => {
        const channel = makeChannel();
        const client = makeClient({
            // allow only Monday: getDay()=1 -> +1 = 2
            daily: [{
                channelID: 'd',
                message: 'msg',
                limitWeekDaysTo: ['2'],
                limitDaysTo: []
            }],
            channels: {d: channel}
        });
        await botReady.run(client);
        const job = getJob('1 6 * * *');

        const allow = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
        try {
            await job.cb();
        } finally {
            allow.mockRestore();
        }
        expect(channel.send).toHaveBeenCalledTimes(1);

        channel.send.mockClear();
        const deny = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(4);
        try {
            await job.cb();
        } finally {
            deny.mockRestore();
        }
        expect(channel.send).not.toHaveBeenCalled();
    });

    test('respects limitDaysTo (day of month)', async () => {
        const channel = makeChannel();
        const client = makeClient({
            daily: [{
                channelID: 'd',
                message: 'msg',
                limitWeekDaysTo: [],
                limitDaysTo: ['15']
            }],
            channels: {d: channel}
        });
        await botReady.run(client);
        const job = getJob('1 6 * * *');

        const deny = jest.spyOn(Date.prototype, 'getDate').mockReturnValue(10);
        try {
            await job.cb();
        } finally {
            deny.mockRestore();
        }
        expect(channel.send).not.toHaveBeenCalled();

        const allow = jest.spyOn(Date.prototype, 'getDate').mockReturnValue(15);
        try {
            await job.cb();
        } finally {
            allow.mockRestore();
        }
        expect(channel.send).toHaveBeenCalledTimes(1);
    });
});

describe('cronjob', () => {
    test('sends to the configured channel when the job fires', async () => {
        const channel = makeChannel();
        const client = makeClient({
            cronjob: [{
                expression: '*/5 * * * *',
                channelID: 'cc',
                message: 'tick'
            }],
            channels: {cc: channel}
        });
        await botReady.run(client);
        await getJob('*/5 * * * *').cb();
        expect(channel.send).toHaveBeenCalledTimes(1);
    });
});