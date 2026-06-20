/*
 * Tests for the reminders snooze button handler (events/interactionCreate.js).
 *
 * Covered behavior:
 *   - ignores non-button interactions and non-snooze custom IDs
 *   - parses the duration key + reminder id out of the custom id
 *   - rejects unknown durations and reminders owned by a different user
 *   - creates a NEW reminder offset by the snooze duration, schedules it,
 *     clears the original message components and confirms ephemerally
 *
 * The sibling reminders.js (which pulls in node-schedule + helpers) is mocked so
 * planReminder is just a spy.
 */

jest.mock('../../modules/reminders/reminders', () => ({planReminder: jest.fn()}));

const {planReminder} = require('../../modules/reminders/reminders');
const handler = require('../../modules/reminders/events/interactionCreate');

function makeClient(reminder) {
    return {
        models: {
            reminders: {
                Reminder: {
                    findOne: jest.fn().mockResolvedValue(reminder),
                    create: jest.fn().mockImplementation((obj) => Promise.resolve({id: 99, ...obj}))
                }
            }
        }
    };
}

function makeInteraction(customId, userID = 'owner') {
    return {
        customId,
        isButton: () => true,
        user: {id: userID},
        reply: jest.fn().mockResolvedValue(),
        update: jest.fn().mockResolvedValue(),
        followUp: jest.fn().mockResolvedValue()
    };
}

const original = {
    id: '42',
    userID: 'owner',
    reminderText: 'drink water',
    channelID: 'chan1'
};

beforeEach(() => planReminder.mockClear());

describe('reminders snooze handler guards', () => {
    test('ignores non-button interactions', async () => {
        const client = makeClient(original);
        const interaction = {
            isButton: () => false,
            customId: 'reminder-snooze-10m-42'
        };
        await handler.run(client, interaction);
        expect(client.models.reminders.Reminder.findOne).not.toHaveBeenCalled();
    });

    test('ignores buttons with an unrelated custom id', async () => {
        const client = makeClient(original);
        const interaction = makeInteraction('some-other-button');
        await handler.run(client, interaction);
        expect(client.models.reminders.Reminder.findOne).not.toHaveBeenCalled();
    });

    test('ignores an unknown snooze duration key', async () => {
        const client = makeClient(original);
        const interaction = makeInteraction('reminder-snooze-99y-42');
        await handler.run(client, interaction);
        expect(client.models.reminders.Reminder.findOne).not.toHaveBeenCalled();
        expect(planReminder).not.toHaveBeenCalled();
    });

    test('rejects snoozing a reminder owned by another user', async () => {
        const client = makeClient(original);
        const interaction = makeInteraction('reminder-snooze-10m-42', 'someone-else');
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                ephemeral: true,
                content: expect.stringContaining('reminders.snooze-not-allowed')
            })
        );
        expect(planReminder).not.toHaveBeenCalled();
    });

    test('rejects when the original reminder no longer exists', async () => {
        const client = makeClient(null);
        const interaction = makeInteraction('reminder-snooze-10m-42');
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalled();
        expect(planReminder).not.toHaveBeenCalled();
    });
});

describe('reminders snooze handler success path', () => {
    test('creates a new reminder offset by the snooze duration and schedules it', async () => {
        const client = makeClient(original);
        const interaction = makeInteraction('reminder-snooze-30m-42');
        const before = Date.now();
        await handler.run(client, interaction);
        const createArg = client.models.reminders.Reminder.create.mock.calls[0][0];
        expect(createArg.userID).toBe('owner');
        expect(createArg.reminderText).toBe('drink water');
        expect(createArg.channelID).toBe('chan1');
        const offset = createArg.date.getTime() - before;
        // ~30 minutes (allow scheduling slack)
        expect(offset).toBeGreaterThan(30 * 60 * 1000 - 5000);
        expect(offset).toBeLessThan(30 * 60 * 1000 + 5000);
        expect(planReminder).toHaveBeenCalledTimes(1);
    });

    test('clears the original components and confirms via ephemeral followUp', async () => {
        const client = makeClient(original);
        const interaction = makeInteraction('reminder-snooze-1d-42');
        await handler.run(client, interaction);
        expect(interaction.update).toHaveBeenCalledWith({components: []});
        expect(interaction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({
                ephemeral: true,
                content: expect.stringContaining('reminders.snoozed')
            })
        );
    });

    test('maps each duration key to the correct offset', async () => {
        const cases = {
            '10m': 10 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };
        for (const [key, ms] of Object.entries(cases)) {
            const client = makeClient(original);
            const interaction = makeInteraction(`reminder-snooze-${key}-42`);
            const before = Date.now();
            await handler.run(client, interaction);
            const createArg = client.models.reminders.Reminder.create.mock.calls[0][0];
            const offset = createArg.date.getTime() - before;
            expect(offset).toBeGreaterThan(ms - 5000);
            expect(offset).toBeLessThan(ms + 5000);
        }
    });
});