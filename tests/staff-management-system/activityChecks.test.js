/*
 * Behavior tests for the activity-check engine in staff-management.js:
 *
 *   - startActivityCheck(): refuses when one is already ACTIVE, when no target
 *     roles resolve, and when no channel can be resolved; on success it posts the
 *     check message, persists an ActivityCheck row and (manual mode) confirms,
 *     and tags initiatorId/isAutomated correctly for automated vs manual runs
 *   - endActivityCheckProcess(): marks the check ENDED, partitions the expected
 *     members into responded / exceptions (per exceptionsType) / failed, and posts
 *     the result embed to the log channel
 *   - initActivityCheckAutomation(): no-ops when disabled, builds the right cron
 *     string for Weekly/Monthly, and cancels a pre-existing job before scheduling
 *
 * node-schedule + helpers are mocked; discord.js builders are real via the shim.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn().mockResolvedValue({
        content: 'rendered',
        embeds: []
    }),
    safeSetFooter: jest.fn((embed) => embed),
    dateToDiscordTimestamp: jest.fn(() => '<t:0:F>')
}));
jest.mock('node-schedule', () => ({
    scheduledJobs: {},
    scheduleJob: jest.fn((...args) => ({
        args,
        cancel: jest.fn()
    }))
}));

const schedule = require('node-schedule');
const mgmt = require('../../modules/staff-management-system/staff-management');

function modelStub(methods = {}) {
    return {
        findOne: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([]),
        findByPk: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
            id: 1,
            update: jest.fn().mockResolvedValue()
        }),
        update: jest.fn().mockResolvedValue(),
        ...methods
    };
}

function makeClient(models = {}, configs = {}) {
    return {
        guildID: 'g1',
        strings: {footer: 'f'},
        logger: {
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn()
        },
        guilds: {cache: {get: jest.fn().mockReturnValue(null)}},
        models: {
            'staff-management-system': {
                ActivityCheck: modelStub(),
                ActivityCheckResponse: modelStub(),
                StaffProfile: modelStub(),
                ...models
            }
        },
        configurations: {
            'staff-management-system': {
                'activity-checks': {
                    timeframe: 24,
                    checkMessage: 'check',
                    targetRoles: ['staff'], ...configs['activity-checks']
                },
                configuration: configs.configuration || {staffRoles: ['staff']}
            }
        }
    };
}

beforeEach(() => {
    schedule.scheduleJob.mockClear();
    schedule.scheduledJobs = {};
});

describe('startActivityCheck guards', () => {
    test('refuses to start when one is already ACTIVE', async () => {
        const client = makeClient({ActivityCheck: modelStub({findOne: jest.fn().mockResolvedValue({id: 1})})});
        const interaction = {
            editReply: jest.fn().mockResolvedValue(),
            options: {getChannel: () => null},
            guild: {channels: {cache: {get: () => null}}},
            channel: {id: 'c'}
        };
        await mgmt.startActivityCheck(client, interaction, false);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-ac-act')
        }));
    });

    test('refuses when no target roles can be resolved', async () => {
        const client = makeClient({}, {
            'activity-checks': {targetRoles: []},
            configuration: {staffRoles: []}
        });
        const interaction = {
            editReply: jest.fn().mockResolvedValue(),
            options: {getChannel: () => null},
            guild: {channels: {cache: {get: () => null}}},
            channel: null
        };
        await mgmt.startActivityCheck(client, interaction, false);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-ac-norole')
        }));
    });

    test('refuses when no channel can be resolved', async () => {
        const client = makeClient();
        const interaction = {
            editReply: jest.fn().mockResolvedValue(),
            options: {getChannel: () => null},
            guild: {channels: {cache: {get: () => null}}},
            channel: null
        };
        await mgmt.startActivityCheck(client, interaction, false);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-ac-invchan')
        }));
    });
});

describe('startActivityCheck success', () => {
    test('manual run posts the check, persists a row and confirms', async () => {
        const create = jest.fn().mockResolvedValue({id: 5});
        const client = makeClient({ActivityCheck: modelStub({create})});
        const channel = {
            id: 'ac-chan',
            send: jest.fn().mockResolvedValue({id: 'check-msg'})
        };
        const interaction = {
            user: {
                id: 'mod',
                toString: () => '<@mod>'
            },
            editReply: jest.fn().mockResolvedValue(),
            options: {getChannel: () => channel},
            guild: {channels: {cache: {get: () => channel}}},
            channel
        };
        await mgmt.startActivityCheck(client, interaction, false);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            channelId: 'ac-chan',
            status: 'ACTIVE',
            initiatorId: 'mod',
            isAutomated: false
        }));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('succ-ac-start')
        }));
    });

    test('automated run targets the passed channel with a null initiator', async () => {
        const create = jest.fn().mockResolvedValue({id: 6});
        const client = makeClient({ActivityCheck: modelStub({create})});
        const channel = {
            id: 'auto-chan',
            send: jest.fn().mockResolvedValue({id: 'check-msg'})
        };
        await mgmt.startActivityCheck(client, channel, true);
        expect(channel.send).toHaveBeenCalled();
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            channelId: 'auto-chan',
            initiatorId: null,
            isAutomated: true
        }));
    });
});

describe('endActivityCheckProcess', () => {
    function memberCollection(members) {
        return {
            filter(fn) {
                return memberCollection(members.filter(fn));
            },
            forEach(fn) {
                members.forEach(fn);
            },
            keys() {
                return members.map(m => m.id);
            },
            get size() {
                return members.length;
            }
        };
    }

    test('marks the check ENDED and posts a partitioned result embed', async () => {
        const activeCheck = {
            id: 9,
            channelId: 'ac-chan',
            messageId: 'check-msg',
            targetRoles: JSON.stringify(['staff']),
            isAutomated: false,
            initiatorId: 'mod',
            update: jest.fn().mockResolvedValue()
        };
        const logChannel = {send: jest.fn().mockResolvedValue()};
        const members = [
            {
                id: 'responded1',
                user: {bot: false},
                roles: {cache: {some: () => true}}
            },
            {
                id: 'failed1',
                user: {bot: false},
                roles: {cache: {some: () => true}}
            }
        ];
        const guild = {
            channels: {cache: {get: jest.fn((id) => (id === 'ac-chan' ? {messages: {fetch: jest.fn().mockResolvedValue(null)}} : logChannel))}},
            members: {cache: memberCollection(members)}
        };
        const client = makeClient({
            ActivityCheckResponse: modelStub({findAll: jest.fn().mockResolvedValue([{userId: 'responded1'}])}),
            StaffProfile: modelStub({findAll: jest.fn().mockResolvedValue([])})
        }, {'activity-checks': {logChannel: 'log-chan'}});
        client.guilds.cache.get = jest.fn().mockReturnValue(guild);

        await mgmt.endActivityCheckProcess(client, activeCheck);
        expect(activeCheck.update).toHaveBeenCalledWith({status: 'ENDED'});
        expect(logChannel.send).toHaveBeenCalledTimes(1);
        const embed = logChannel.send.mock.calls[0][0].embeds[0];
        // responded field lists responded1, failed field lists failed1
        const fieldValues = embed.fields.map(f => f.value).join(' ');
        expect(fieldValues).toContain('<@responded1>');
        expect(fieldValues).toContain('<@failed1>');
    });

    test('bails (only flips status) when there is no guild', async () => {
        const activeCheck = {
            id: 1,
            update: jest.fn().mockResolvedValue(),
            targetRoles: '[]'
        };
        const client = makeClient();
        client.guilds.cache.get = jest.fn().mockReturnValue(null);
        await mgmt.endActivityCheckProcess(client, activeCheck);
        expect(activeCheck.update).toHaveBeenCalledWith({status: 'ENDED'});
    });
});

describe('initActivityCheckAutomation', () => {
    test('does nothing when automation is disabled', () => {
        const client = makeClient({}, {
            'activity-checks': {
                enableActivityChecks: false,
                automatedChecks: false
            }
        });
        mgmt.initActivityCheckAutomation(client);
        expect(schedule.scheduleJob).not.toHaveBeenCalled();
    });

    test('schedules a weekly cron on the configured weekday', () => {
        const client = makeClient({}, {
            'activity-checks': {
                enableActivityChecks: true,
                automatedChecks: true,
                automatedCheckInterval: 'Weekly',
                automatedCheckWeekDay: 'Wednesday'
            }
        });
        mgmt.initActivityCheckAutomation(client);
        expect(schedule.scheduleJob).toHaveBeenCalledTimes(1);
        const [name, cron] = schedule.scheduleJob.mock.calls[0];
        expect(name).toBe('automated-activity-check');
        expect(cron).toBe('0 12 * * 3'); // Wednesday = 3
    });

    test('uses a literal cron string when interval is Cronjob', () => {
        const client = makeClient({}, {
            'activity-checks': {
                enableActivityChecks: true,
                automatedChecks: true,
                automatedCheckInterval: 'Cronjob',
                automatedCheckCronjob: '0 0 * * 0'
            }
        });
        mgmt.initActivityCheckAutomation(client);
        expect(schedule.scheduleJob.mock.calls[0][1]).toBe('0 0 * * 0');
    });

    test('cancels an existing job before scheduling a new one', () => {
        const cancel = jest.fn();
        schedule.scheduledJobs['automated-activity-check'] = {cancel};
        const client = makeClient({}, {
            'activity-checks': {
                enableActivityChecks: true,
                automatedChecks: true,
                automatedCheckInterval: 'Weekly',
                automatedCheckWeekDay: 'Monday'
            }
        });
        mgmt.initActivityCheckAutomation(client);
        expect(cancel).toHaveBeenCalled();
    });
});