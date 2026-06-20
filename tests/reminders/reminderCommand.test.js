/*
 * Tests for the /remind-me command (commands/reminder.js).
 *
 * Key validation: the requested time must be at least ~1 minute in the future,
 * otherwise the command refuses with an ephemeral warning and does NOT persist
 * a reminder. On success it creates the Reminder row (DM vs. channel target) and
 * schedules it.
 *
 * parseDuration is ESM-only and requires init(); we mock it to a deterministic
 * function. The reminders sibling (node-schedule) is mocked too.
 */

jest.mock('../../src/functions/parseDuration', () => jest.fn());
jest.mock('../../modules/reminders/reminders', () => ({planReminder: jest.fn()}));

const durationParser = require('../../src/functions/parseDuration');
const {planReminder} = require('../../modules/reminders/reminders');
const command = require('../../modules/reminders/commands/reminder');

function makeInteraction({
                             inValue,
                             what = 'do the thing',
                             dm = false
                         } = {}) {
    return {
        user: {id: 'u1'},
        channel: {id: 'chan1'},
        options: {
            getString: jest.fn((name) => (name === 'in' ? inValue : what)),
            getBoolean: jest.fn(() => dm)
        },
        client: {
            models: {
                reminders: {
                    Reminder: {create: jest.fn().mockImplementation((o) => Promise.resolve({id: 5, ...o}))}
                }
            }
        },
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    durationParser.mockReset();
    planReminder.mockClear();
});

describe('/remind-me validation', () => {
    test('refuses a time less than a minute in the future', async () => {
        durationParser.mockReturnValue(30 * 1000); // 30s
        const interaction = makeInteraction({inValue: '30s'});
        await command.run(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                ephemeral: true,
                content: expect.stringContaining('reminders.one-minute-in-future')
            })
        );
        expect(interaction.client.models.reminders.Reminder.create).not.toHaveBeenCalled();
        expect(planReminder).not.toHaveBeenCalled();
    });

    test('refuses an unparseable duration (NaN)', async () => {
        durationParser.mockReturnValue(NaN);
        const interaction = makeInteraction({inValue: 'gibberish'});
        await command.run(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: expect.stringContaining('reminders.one-minute-in-future')})
        );
        expect(interaction.client.models.reminders.Reminder.create).not.toHaveBeenCalled();
    });
});

describe('/remind-me success path', () => {
    test('creates a channel reminder and schedules it', async () => {
        durationParser.mockReturnValue(2 * 60 * 1000); // 2 min
        const interaction = makeInteraction({
            inValue: '2m',
            what: 'standup'
        });
        await command.run(interaction);
        const createArg = interaction.client.models.reminders.Reminder.create.mock.calls[0][0];
        expect(createArg.userID).toBe('u1');
        expect(createArg.reminderText).toBe('standup');
        expect(createArg.channelID).toBe('chan1');
        expect(createArg.date.getTime()).toBeGreaterThan(Date.now());
        expect(planReminder).toHaveBeenCalledTimes(1);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: expect.stringContaining('reminders.reminder-set')})
        );
    });

    test('targets DM when the dm option is set', async () => {
        durationParser.mockReturnValue(5 * 60 * 1000);
        const interaction = makeInteraction({
            inValue: '5m',
            dm: true
        });
        await command.run(interaction);
        const createArg = interaction.client.models.reminders.Reminder.create.mock.calls[0][0];
        expect(createArg.channelID).toBe('DM');
    });
});