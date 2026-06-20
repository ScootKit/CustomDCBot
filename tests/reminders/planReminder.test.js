/*
 * Tests for planReminder(): it schedules a node-schedule job for a reminder's
 * due date and registers it on client.jobs. It must REFUSE to schedule when the
 * date is missing, not a real date, or already in the past (those reminders
 * would fire immediately / never), so we assert the guard chain.
 *
 * node-schedule is mocked so no real timers are created and we can capture the
 * scheduled callback for the "fire" path.
 */

jest.mock('node-schedule', () => ({
    scheduleJob: jest.fn((date, cb) => ({
        date,
        cb,
        cancel: jest.fn()
    }))
}));

const {scheduleJob} = require('node-schedule');
const {planReminder} = require('../../modules/reminders/reminders');

function makeClient() {
    return {jobs: []};
}

beforeEach(() => {
    scheduleJob.mockClear();
});

describe('planReminder scheduling guards', () => {
    test('schedules a job for a future date and tracks it on client.jobs', () => {
        const client = makeClient();
        const future = new Date(Date.now() + 60 * 60 * 1000);
        planReminder(client, {
            id: 1,
            date: future,
            userID: 'u',
            reminderText: 'hi',
            channelID: 'c'
        });
        expect(scheduleJob).toHaveBeenCalledTimes(1);
        expect(scheduleJob.mock.calls[0][0]).toBe(future);
        expect(client.jobs).toHaveLength(1);
    });

    test('does not schedule when the date is missing', () => {
        const client = makeClient();
        planReminder(client, {
            id: 1,
            date: null
        });
        expect(scheduleJob).not.toHaveBeenCalled();
        expect(client.jobs).toHaveLength(0);
    });

    test('does not schedule when the date is invalid', () => {
        const client = makeClient();
        planReminder(client, {
            id: 1,
            date: new Date('not-a-date')
        });
        expect(scheduleJob).not.toHaveBeenCalled();
        expect(client.jobs).toHaveLength(0);
    });

    test('does not schedule a date already in the past', () => {
        const client = makeClient();
        const past = new Date(Date.now() - 1000);
        planReminder(client, {
            id: 1,
            date: past
        });
        expect(scheduleJob).not.toHaveBeenCalled();
        expect(client.jobs).toHaveLength(0);
    });
});

describe('planReminder fire callback', () => {
    function makeFireClient(channel, member) {
        return {
            jobs: [],
            guild: {
                members: {fetch: jest.fn().mockResolvedValue(member)},
                channels: {cache: {get: jest.fn().mockReturnValue(channel)}}
            },
            configurations: {reminders: {config: {notificationMessage: 'You asked: %message%'}}}
        };
    }

    test('sends the reminder to the configured guild channel', async () => {
        const channel = {send: jest.fn().mockResolvedValue()};
        const member = {
            user: {
                toString: () => '<@u>',
                tag: 'U#1',
                avatarURL: () => null
            }
        };
        const client = makeFireClient(channel, member);
        planReminder(client, {
            id: 7,
            date: new Date(Date.now() + 1000),
            userID: 'u',
            reminderText: 'water',
            channelID: 'chan1'
        });
        const cb = scheduleJob.mock.calls[0][1];
        await cb();
        expect(client.guild.members.fetch).toHaveBeenCalledWith('u');
        expect(channel.send).toHaveBeenCalledTimes(1);
    });

    test('sends to a DM channel when channelID is "DM"', async () => {
        const dmChannel = {send: jest.fn().mockResolvedValue()};
        const member = {
            user: {
                toString: () => '<@u>',
                tag: 'U#1',
                avatarURL: () => null,
                createDM: jest.fn().mockResolvedValue(dmChannel)
            }
        };
        const client = makeFireClient(null, member);
        planReminder(client, {
            id: 8,
            date: new Date(Date.now() + 1000),
            userID: 'u',
            reminderText: 'water',
            channelID: 'DM'
        });
        const cb = scheduleJob.mock.calls[0][1];
        await cb();
        expect(member.user.createDM).toHaveBeenCalled();
        expect(dmChannel.send).toHaveBeenCalledTimes(1);
    });

    test('does nothing if the member can no longer be fetched', async () => {
        const channel = {send: jest.fn().mockResolvedValue()};
        const client = makeFireClient(channel, null);
        planReminder(client, {
            id: 9,
            date: new Date(Date.now() + 1000),
            userID: 'gone',
            reminderText: 'x',
            channelID: 'chan1'
        });
        const cb = scheduleJob.mock.calls[0][1];
        await cb();
        expect(channel.send).not.toHaveBeenCalled();
    });
});