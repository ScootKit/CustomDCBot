/*
 * Tests for polls.js: createPoll and updateMessage.
 *
 * createPoll seeds an empty votes map keyed 1..n, persists a Poll row, renders
 * the message, and schedules an end job only when endAt is set.
 *
 * updateMessage builds the embed/components: per-option counts, the live-view
 * progress bars, the public/private visibility field, the max-selections field
 * (only when effectiveMax > 1), the expired styling, and the extra
 * "view public votes" button for public polls. It edits an existing message
 * when mID resolves, otherwise sends a new one.
 */
const mockScheduleJob = jest.fn(() => ({cancel: jest.fn()}));
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockScheduleJob(...a)}));

const {
    createPoll,
    updateMessage
} = require('../../modules/polls/polls');

function makeChannel({existingMessage = null} = {}) {
    const sent = [];
    const edited = [];
    const channel = {
        id: 'chan1',
        send: jest.fn(async (p) => {
            sent.push(p);
            return {id: 'new-msg'};
        }),
        messages: {
            fetch: jest.fn(async () => existingMessage)
        },
        sent,
        edited
    };
    const message = existingMessage;
    if (message) {
        message.edit = jest.fn(async (p) => {
            edited.push(p);
            return {id: message.id};
        });
    }
    channel.client = {
        configurations: {
            polls: {
                strings: {
                    embed: {
                        title: 'Poll',
                        color: 'BLUE',
                        options: 'Options',
                        liveView: 'Live',
                        visibility: 'Visibility',
                        expiresOn: 'Expires',
                        thisPollExpiresOn: 'on %date%',
                        endedPollColor: 'RED',
                        endedPollTitle: 'Ended'
                    }
                },
                config: {reactions: [null, '1️⃣', '2️⃣', '3️⃣']}
            }
        }
    };
    return {
        channel,
        message
    };
}

beforeEach(() => mockScheduleJob.mockClear());

describe('updateMessage', () => {
    test('renders option counts, live view and a private visibility field', async () => {
        const {channel} = makeChannel();
        const data = {
            description: 'Question?',
            options: ['A', 'B'],
            votes: {
                '1': ['u1'],
                '2': []
            }
        };
        const id = await updateMessage(channel, data);
        expect(id).toBe('new-msg');
        const payload = channel.sent[0];
        const embed = payload.embeds[0];
        const optionsField = embed.data.fields.find(f => f.name === 'Options');
        expect(optionsField.value).toContain('1️⃣: A `1`');
        expect(optionsField.value).toContain('2️⃣: B `0`');
        const visField = embed.data.fields.find(f => f.name === 'Visibility');
        expect(visField.value).toBe('polls.poll-private');
    });

    test('marks a [PUBLIC] poll public and adds the public-votes button', async () => {
        const {channel} = makeChannel();
        const data = {
            description: '[PUBLIC]Q',
            options: ['A', 'B'],
            votes: {
                '1': [],
                '2': []
            }
        };
        await updateMessage(channel, data);
        const payload = channel.sent[0];
        const visField = payload.embeds[0].data.fields.find(f => f.name === 'Visibility');
        expect(visField.value).toBe('polls.poll-public');
        const buttonRow = payload.components[1];
        const ids = buttonRow.components.map(c => c.customId);
        expect(ids).toContain('polls-public-votes');
        // description rendered without the [PUBLIC] marker
        expect(payload.embeds[0].data.description).toBe('Q');
    });

    test('adds a max-selections field only when effectiveMax > 1', async () => {
        const {channel} = makeChannel();
        const data = {
            description: 'Q',
            options: ['A', 'B', 'C'],
            votes: {
                '1': [],
                '2': [],
                '3': []
            },
            maxSelections: 2
        };
        await updateMessage(channel, data);
        const fields = channel.sent[0].embeds[0].data.fields.map(f => f.name);
        expect(fields).toContain('polls.max-selections-field');
        // select menu max_values reflects the cap
        const menu = channel.sent[0].components[0].components[0];
        expect(menu.max_values).toBe(2);
    });

    test('treats maxSelections 0 as unlimited (capped to option count)', async () => {
        const {channel} = makeChannel();
        const data = {
            description: 'Q',
            options: ['A', 'B'],
            votes: {
                '1': [],
                '2': []
            },
            maxSelections: 0
        };
        await updateMessage(channel, data);
        const menu = channel.sent[0].components[0].components[0];
        expect(menu.max_values).toBe(2);
        const fields = channel.sent[0].embeds[0].data.fields;
        const msField = fields.find(f => f.name === 'polls.max-selections-field');
        expect(msField.value).toBe('polls.max-selections-unlimited');
    });

    test('omits the max-selections field for single-select polls', async () => {
        const {channel} = makeChannel();
        const data = {
            description: 'Q',
            options: ['A', 'B'],
            votes: {
                '1': [],
                '2': []
            },
            maxSelections: 1
        };
        await updateMessage(channel, data);
        const fields = channel.sent[0].embeds[0].data.fields.map(f => f.name);
        expect(fields).not.toContain('polls.max-selections-field');
    });

    test('applies ended styling and disables the menu for an expired poll', async () => {
        const {channel} = makeChannel();
        const data = {
            description: 'Q',
            options: ['A', 'B'],
            votes: {
                '1': [],
                '2': []
            },
            expiresAt: new Date(Date.now() - 5000)
        };
        await updateMessage(channel, data);
        const payload = channel.sent[0];
        expect(payload.embeds[0].data.title).toBe('Ended');
        expect(payload.components[0].components[0].disabled).toBe(true);
    });

    test('edits an existing message when mID resolves', async () => {
        const existing = {id: 'm-old'};
        const {
            channel,
            message
        } = makeChannel({existingMessage: existing});
        const data = {
            description: 'Q',
            options: ['A'],
            votes: {'1': []}
        };
        const id = await updateMessage(channel, data, 'm-old');
        expect(message.edit).toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
        expect(id).toBe('m-old');
    });
});

describe('createPoll', () => {
    function makeClient(channel) {
        return {
            jobs: [],
            models: {
                polls: {
                    Poll: {
                        create: jest.fn().mockResolvedValue({}),
                        findOne: jest.fn()
                    }
                }
            }
        };
    }

    test('seeds an empty votes map and persists the poll without a job when no endAt', async () => {
        const {channel} = makeChannel();
        const client = makeClient(channel);
        await createPoll({
            description: 'Q',
            options: ['A', 'B'],
            channel
        }, client);
        const createArg = client.models.polls.Poll.create.mock.calls[0][0];
        expect(createArg.votes).toEqual({
            '1': [],
            '2': []
        });
        expect(createArg.maxSelections).toBe(1);
        expect(client.jobs).toHaveLength(0);
        expect(mockScheduleJob).not.toHaveBeenCalled();
    });

    test('schedules an end job and stores maxSelections when endAt is set', async () => {
        const {channel} = makeChannel();
        const client = makeClient(channel);
        const endAt = new Date(Date.now() + 60000);
        await createPoll({
            description: 'Q',
            options: ['A', 'B', 'C'],
            channel,
            endAt,
            maxSelections: 2
        }, client);
        expect(client.models.polls.Poll.create.mock.calls[0][0].maxSelections).toBe(2);
        expect(mockScheduleJob).toHaveBeenCalledTimes(1);
        expect(client.jobs).toHaveLength(1);
    });
});