/*
 * Extra coverage for planReminder()'s fired notification: it must attach the four
 * snooze buttons (10m/30m/1h/1d) with customIds that embed the reminder id, and
 * pass the reminder's placeholders to embedType. Complements planReminder.test.js
 * (which only checks scheduling + the send target).
 *
 * node-schedule + helpers are mocked so we can capture the scheduled callback and
 * inspect the exact embedType arguments.
 */

jest.mock('node-schedule', () => ({
    scheduleJob: jest.fn((date, cb) => ({
        date,
        cb,
        cancel: jest.fn()
    }))
}));
jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((tpl, params, opts) => ({
        tpl,
        params,
        opts
    })),
    formatDiscordUserName: (u) => (u && u.tag) || 'user'
}));

const {scheduleJob} = require('node-schedule');
const helpers = require('../../src/functions/helpers');
const {planReminder} = require('../../modules/reminders/reminders');

beforeEach(() => {
    scheduleJob.mockClear();
    helpers.embedType.mockClear();
});

function makeClient(channel, member) {
    return {
        jobs: [],
        guild: {
            members: {fetch: jest.fn().mockResolvedValue(member)},
            channels: {cache: {get: jest.fn().mockReturnValue(channel)}}
        },
        configurations: {reminders: {config: {notificationMessage: 'Hey %mention%: %message%'}}}
    };
}

test('the fired notification attaches the four snooze buttons carrying the reminder id', async () => {
    const channel = {send: jest.fn().mockResolvedValue()};
    const member = {
        user: {
            toString: () => '<@u>',
            tag: 'U#1',
            avatarURL: () => 'a'
        }
    };
    const client = makeClient(channel, member);

    planReminder(client, {
        id: 77,
        date: new Date(Date.now() + 1000),
        userID: 'u',
        reminderText: 'drink water',
        channelID: 'chan1'
    });
    const cb = scheduleJob.mock.calls[0][1];
    await cb();

    expect(helpers.embedType).toHaveBeenCalledTimes(1);
    const [tpl, params, opts] = helpers.embedType.mock.calls[0];
    expect(tpl).toBe('Hey %mention%: %message%');
    expect(params['%message%']).toBe('drink water');

    const buttons = opts.components[0].components;
    expect(buttons).toHaveLength(4);
    const ids = buttons.map(b => b.customId);
    expect(ids).toEqual([
        'reminder-snooze-10m-77',
        'reminder-snooze-30m-77',
        'reminder-snooze-1h-77',
        'reminder-snooze-1d-77'
    ]);
});