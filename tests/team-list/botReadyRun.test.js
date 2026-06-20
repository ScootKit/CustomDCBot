/*
 * Behavior tests for the team-list botReady handler (events/botReady.js run()
 * and its internal updateEmbedsIfNeeded). run() builds a per-channel role-roster
 * embed and either edits an existing tracked message or sends a new one, then
 * schedules periodic refreshes.
 *
 * Covers: scheduling + initial render, channel-not-found short circuit, the
 * "no roles selected" warning field, sending a fresh message persists its id,
 * editing an existing tracked message, and the is-equal dedup cache skipping a
 * redundant edit on an unchanged embed. node-schedule is mocked so no real
 * timers run; is-equal is mocked to a controllable comparator.
 */

const mockScheduleJob = jest.fn(() => ({cancel: jest.fn()}));
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockScheduleJob(...a)}));

let mockIsEqualReturn = false;
jest.mock('is-equal', () => (...args) => (typeof mockIsEqualReturn === 'function' ? mockIsEqualReturn(...args) : mockIsEqualReturn));

const botReady = require('../../modules/team-list/events/botReady');

function makeRole(id, name, position) {
    return {
        id,
        name,
        position,
        toString: () => `<@&${id}>`
    };
}

function collection(items) {
    const map = new Map(items.map(i => [i.id, i]));
    map.filter = (fn) => collection([...map.values()].filter(fn));
    map.sort = (cmp) => collection([...map.values()].sort(cmp));
    return map;
}

function makeMember(id, roleIds) {
    return {
        user: {
            id,
            toString: () => `<@${id}>`
        },
        presence: {status: 'online'},
        roles: {cache: {has: (rid) => roleIds.includes(rid)}}
    };
}

function makeClient({
                        channels = [],
                        roles = [],
                        members = [],
                        channelFound = true,
                        existingMessageID = null
                    } = {}) {
    const sentMessages = [];
    const editedMessages = [];
    const messageData = {
        messageID: existingMessageID,
        save: jest.fn().mockResolvedValue()
    };
    const channelObj = {
        id: 'chan1',
        guild: {roles: {fetch: jest.fn().mockResolvedValue(collection(roles))}},
        messages: {
            fetch: jest.fn().mockResolvedValue(existingMessageID ? {
                id: existingMessageID,
                edit: jest.fn((m) => {
                    editedMessages.push(m);
                    return Promise.resolve();
                })
            } : null)
        },
        send: jest.fn((m) => {
            sentMessages.push(m);
            return Promise.resolve({id: 'newmsg'});
        })
    };
    return {
        _sent: sentMessages,
        _edited: editedMessages,
        _messageData: messageData,
        configurations: {'team-list': {config: channels}},
        strings: {
            footer: 'F',
            footerImgUrl: 'http://i/f.png',
            disableFooterTimestamp: false
        },
        logger: {error: jest.fn()},
        jobs: [],
        guild: {members: {cache: collection(members)}},
        channels: {fetch: jest.fn().mockResolvedValue(channelFound ? channelObj : null)},
        models: {
            'team-list': {
                TeamListMessage: {
                    findOrCreate: jest.fn().mockResolvedValue([messageData])
                }
            }
        }
    };
}

function baseChannelConfig(overrides = {}) {
    return {
        channelID: 'chan1',
        roles: ['r1'],
        nameOverwrites: {},
        descriptions: {},
        embed: {
            color: 'BLUE',
            title: 'Team'
        },
        ...overrides
    };
}

beforeEach(() => {
    mockScheduleJob.mockClear();
    mockIsEqualReturn = false;
});

test('run schedules a cron refresh and pushes the job', async () => {
    const client = makeClient({channels: []});
    await botReady.run(client);
    expect(mockScheduleJob).toHaveBeenCalledWith('1,16,31,46 * * * *', expect.any(Function));
    expect(client.jobs.length).toBe(1);
});

test('logs and skips a channel that cannot be fetched', async () => {
    const client = makeClient({
        channels: [baseChannelConfig()],
        channelFound: false
    });
    await botReady.run(client);
    expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not find channel'));
    expect(client.models['team-list'].TeamListMessage.findOrCreate).not.toHaveBeenCalled();
});

test('sends a new message and persists its id when none is tracked yet', async () => {
    const client = makeClient({
        channels: [baseChannelConfig()],
        roles: [makeRole('r1', 'Mods', 5)],
        members: [makeMember('u1', ['r1'])],
        existingMessageID: null
    });
    await botReady.run(client);
    expect(client._sent.length).toBe(1);
    expect(client._messageData.messageID).toBe('newmsg');
    expect(client._messageData.save).toHaveBeenCalled();
    const embed = client._sent[0].embeds[0].toJSON();
    expect(embed.fields[0].name).toBe('Mods');
    expect(embed.fields[0].value).toContain('<@u1>');
});

test('applies nameOverwrites and role descriptions to the field', async () => {
    const client = makeClient({
        channels: [baseChannelConfig({
            nameOverwrites: {r1: 'Custom'},
            descriptions: {r1: 'Desc line'}
        })],
        roles: [makeRole('r1', 'Mods', 5)],
        members: [makeMember('u1', ['r1'])]
    });
    await botReady.run(client);
    const embed = client._sent[0].embeds[0].toJSON();
    expect(embed.fields[0].name).toBe('Custom');
    expect(embed.fields[0].value).toContain('Desc line');
});

test('adds a warning field when no roles are selected', async () => {
    const client = makeClient({
        channels: [baseChannelConfig({roles: []})],
        roles: [makeRole('r1', 'Mods', 5)]
    });
    await botReady.run(client);
    const embed = client._sent[0].embeds[0].toJSON();
    expect(embed.fields[0].name).toBe('⚠️');
    expect(embed.fields[0].value).toBe('team-list.no-roles-selected');
});

test('edits the existing tracked message instead of sending a new one', async () => {
    const client = makeClient({
        channels: [baseChannelConfig()],
        roles: [makeRole('r1', 'Mods', 5)],
        members: [makeMember('u1', ['r1'])],
        existingMessageID: 'old123'
    });
    await botReady.run(client);
    expect(client._edited.length).toBe(1);
    expect(client._sent.length).toBe(0);
});

test('dedup cache skips the update when the embed is unchanged', async () => {
    mockIsEqualReturn = true; // pretend lastSavedEmbed matches the freshly built embed
    const client = makeClient({
        channels: [baseChannelConfig()],
        roles: [makeRole('r1', 'Mods', 5)],
        members: [makeMember('u1', ['r1'])]
    });
    await botReady.run(client);
    expect(client.models['team-list'].TeamListMessage.findOrCreate).not.toHaveBeenCalled();
    expect(client._sent.length).toBe(0);
});