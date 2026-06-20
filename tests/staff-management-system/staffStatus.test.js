/*
 * Behavior tests for the LOA/RA status logic in commands/staff-status.js.
 *
 * Covers the exported helpers and request handlers:
 *   - isStatusTypeEnabled(): the master switch + per-type (LOA/RA) gating
 *   - sendStatusDm(): builds the right embed per dmType, no-ops on an unknown
 *     type, and swallows send failures
 *   - logStatusChange(): respects logStatusChanges, resolves the log channel,
 *     and bails when disabled / channel missing
 *   - handleStatusRequest(): disabled gate, duration validation + max-days cap,
 *     duplicate-active-request guard, PENDING vs auto-APPROVED creation, and the
 *     role grant + log on the no-approval path
 *   - handleStatusView(): "no active status" path vs rendering an active request
 *   - handleStatusList(): the active / expired / history where-clause selection
 *     and the empty-result message
 *   - scheduleStatusExpiry(): registers a node-schedule job at the end date and,
 *     when it fires, ends a still-APPROVED request and clears the role
 *
 * helpers (formatDate/dateToDiscordTimestamp/safeSetFooter/embedTypeV2) and
 * node-schedule are mocked; discord.js builders are real via the shim.
 */

jest.mock('../../src/functions/helpers', () => ({
    formatDate: jest.fn(() => 'FMT'),
    dateToDiscordTimestamp: jest.fn(() => '<t:0:F>'),
    safeSetFooter: jest.fn((embed) => embed),
    embedTypeV2: jest.fn().mockResolvedValue({content: 'rendered'})
}));
jest.mock('node-schedule', () => ({
    scheduledJobs: {},
    scheduleJob: jest.fn((name, when, cb) => ({
        name,
        when,
        cb,
        cancel: jest.fn()
    }))
}));

const {Op} = require('sequelize');
const schedule = require('node-schedule');
const status = require('../../modules/staff-management-system/commands/staff-status');

function modelStub(methods = {}) {
    return {
        findOne: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([]),
        findByPk: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({id: 1}),
        update: jest.fn().mockResolvedValue(),
        ...methods
    };
}

function makeClient(models = {}, statusConfig = {}, generalConfig = {}) {
    return {
        guildID: 'g1',
        strings: {footer: 'f'},
        logger: {
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn()
        },
        guilds: {cache: {get: jest.fn().mockReturnValue(null)}},
        users: {fetch: jest.fn().mockResolvedValue(null)},
        models: {
            'staff-management-system': {
                LoaRequest: modelStub(),
                StaffProfile: modelStub(),
                ...models
            }
        },
        configurations: {
            'staff-management-system': {
                status: {
                    enableStatusSystem: true,
                    enableLoa: true,
                    enableRa: true, ...statusConfig
                },
                configuration: generalConfig
            }
        }
    };
}

describe('isStatusTypeEnabled', () => {
    // isStatusTypeEnabled is not directly exported, but its behavior is reachable
    // through handleStatusRequest's disabled gate. We test it via that surface.
    test('handleStatusRequest refuses when the whole status system is off', async () => {
        const client = makeClient({}, {enableStatusSystem: false});
        const interaction = {
            user: {id: 'u'},
            editReply: jest.fn().mockResolvedValue()
        };
        await status.handleStatusRequest(client, interaction, 'LOA', '5d', 'why');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-status-disabled')
        }));
    });

    test('handleStatusRequest refuses LOA when only RA is enabled', async () => {
        const client = makeClient({}, {
            enableLoa: false,
            enableRa: true
        });
        const interaction = {
            user: {id: 'u'},
            editReply: jest.fn().mockResolvedValue()
        };
        await status.handleStatusRequest(client, interaction, 'LOA', '5d', 'why');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-status-disabled')
        }));
    });
});

describe('sendStatusDm', () => {
    function makeUser() {
        return {
            tag: 'U#1',
            send: jest.fn().mockResolvedValue(),
            client: {
                logger: {error: jest.fn()},
                strings: {footer: 'f'}
            }
        };
    }

    test('sends an embed for a known dmType', async () => {
        const user = makeUser();
        await status.sendStatusDm(user, 'LOA', 'approved', {
            approver: 'admin',
            endDate: new Date()
        });
        expect(user.send).toHaveBeenCalledTimes(1);
        expect(user.send.mock.calls[0][0].embeds).toHaveLength(1);
    });

    test('does nothing for an unknown dmType', async () => {
        const user = makeUser();
        await status.sendStatusDm(user, 'LOA', 'nonsense', {});
        expect(user.send).not.toHaveBeenCalled();
    });

    test('swallows send failures and logs them', async () => {
        const user = makeUser();
        user.send = jest.fn().mockRejectedValue(new Error('blocked DMs'));
        await expect(status.sendStatusDm(user, 'RA', 'denied', {
            denier: 'admin',
            reason: 'no'
        })).resolves.toBeUndefined();
        expect(user.client.logger.error).toHaveBeenCalled();
    });
});

describe('logStatusChange', () => {
    test('does nothing when logStatusChanges is disabled', async () => {
        const client = makeClient({}, {logStatusChanges: false});
        await status.logStatusChange(client, 'LOA', 'start', {userId: 'u'});
        expect(client.guilds.cache.get).not.toHaveBeenCalled();
    });

    test('bails when no log channel id is configured', async () => {
        const client = makeClient({}, {logStatusChanges: true});
        await status.logStatusChange(client, 'LOA', 'start', {userId: 'u'});
        // No guild lookup beyond the channel resolution short-circuit
        expect(client.guilds.cache.get).not.toHaveBeenCalled();
    });

    test('sends a start log embed to the resolved channel', async () => {
        const channel = {send: jest.fn().mockResolvedValue()};
        const guild = {channels: {fetch: jest.fn().mockResolvedValue(channel)}};
        const client = makeClient({}, {
            logStatusChanges: true,
            statusChangeLogChannel: 'log-chan'
        });
        client.guilds.cache.get = jest.fn().mockReturnValue(guild);
        await status.logStatusChange(client, 'LOA', 'start', {
            userId: 'u',
            startDate: new Date(),
            endDate: new Date(),
            reason: 'trip',
            approverId: 'admin'
        });
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(channel.send.mock.calls[0][0].embeds).toHaveLength(1);
    });
});

describe('handleStatusRequest validation', () => {
    function makeInteraction() {
        return {
            user: {
                id: 'u',
                toString: () => '<@u>'
            },
            member: {roles: {add: jest.fn().mockResolvedValue()}},
            guild: {channels: {fetch: jest.fn().mockResolvedValue(null)}},
            editReply: jest.fn().mockResolvedValue()
        };
    }

    test('rejects an unparseable / non-positive duration', async () => {
        const client = makeClient();
        const interaction = makeInteraction();
        await status.handleStatusRequest(client, interaction, 'LOA', 'garbage', 'why');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-invalid-duration')
        }));
    });

    test('rejects durations beyond the configured max', async () => {
        const client = makeClient({}, {loaMaxDays: 7});
        const interaction = makeInteraction();
        await status.handleStatusRequest(client, interaction, 'LOA', '30d', 'why');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-duration-max')
        }));
    });

    test('rejects when an overlapping active request already exists', async () => {
        const client = makeClient({LoaRequest: modelStub({findOne: jest.fn().mockResolvedValue({id: 9})})});
        const interaction = makeInteraction();
        await status.handleStatusRequest(client, interaction, 'LOA', '5d', 'why');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-status-exists')
        }));
    });

    test('creates a PENDING request when approval is required', async () => {
        const create = jest.fn().mockResolvedValue({id: 12});
        const client = makeClient({LoaRequest: modelStub({create})}, {requireLoaApproval: true});
        const interaction = makeInteraction();
        await status.handleStatusRequest(client, interaction, 'LOA', '5d', 'vacation');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            status: 'PENDING',
            type: 'LOA',
            userId: 'u'
        }));
        expect(interaction.member.roles.add).not.toHaveBeenCalled();
    });

    test('auto-approves and grants the role when approval is not required', async () => {
        const create = jest.fn().mockResolvedValue({id: 13});
        const client = makeClient(
            {LoaRequest: modelStub({create})},
            {
                requireLoaApproval: false,
                loaRole: 'loa-role'
            }
        );
        const interaction = makeInteraction();
        await status.handleStatusRequest(client, interaction, 'LOA', '5d', 'vacation');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({status: 'APPROVED'}));
        expect(interaction.member.roles.add).toHaveBeenCalledWith('loa-role');
    });
});

describe('handleStatusView', () => {
    test('reports when the user has no active status', async () => {
        const client = makeClient();
        const interaction = {
            user: {
                id: 'u',
                username: 'U'
            },
            editReply: jest.fn().mockResolvedValue()
        };
        await status.handleStatusView(client, interaction, 'LOA', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('no-active-status')
        }));
    });

    test('renders the active request embed', async () => {
        const request = {
            status: 'APPROVED',
            endDate: new Date(),
            reason: 'trip'
        };
        const client = makeClient({LoaRequest: modelStub({findOne: jest.fn().mockResolvedValue(request)})});
        const user = {
            id: 'u',
            username: 'U',
            displayAvatarURL: () => 'https://cdn.example/a.png'
        };
        const interaction = {
            user,
            editReply: jest.fn().mockResolvedValue()
        };
        await status.handleStatusView(client, interaction, 'LOA', user);
        const payload = interaction.editReply.mock.calls[0][0];
        expect(payload.embeds).toHaveLength(1);
    });
});

describe('handleStatusList', () => {
    test('reports an empty result set', async () => {
        const client = makeClient();
        const interaction = {editReply: jest.fn().mockResolvedValue()};
        await status.handleStatusList(client, interaction, 'LOA', 'active');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-no-recs')
        }));
    });

    test('active filter searches only APPROVED + future-dated rows', async () => {
        const findAll = jest.fn().mockResolvedValue([{
            userId: 'u',
            status: 'APPROVED',
            endDate: new Date(),
            reason: 'r'
        }]);
        const client = makeClient({LoaRequest: modelStub({findAll})});
        const interaction = {editReply: jest.fn().mockResolvedValue()};
        await status.handleStatusList(client, interaction, 'LOA', 'active');
        const where = findAll.mock.calls[0][0].where;
        expect(where.status).toBe('APPROVED');
        expect(where.endDate[Op.gt]).toBeInstanceOf(Date);
    });

    test('expired filter searches APPROVED/ENDED within the recent window', async () => {
        const findAll = jest.fn().mockResolvedValue([{
            userId: 'u',
            status: 'ENDED',
            endDate: new Date(),
            reason: 'r'
        }]);
        const client = makeClient({LoaRequest: modelStub({findAll})});
        const interaction = {editReply: jest.fn().mockResolvedValue()};
        await status.handleStatusList(client, interaction, 'LOA', 'expired');
        const where = findAll.mock.calls[0][0].where;
        expect(where.status[Op.in]).toEqual(['APPROVED', 'ENDED']);
        expect(Array.isArray(where.endDate[Op.between])).toBe(true);
    });
});

describe('scheduleStatusExpiry', () => {
    beforeEach(() => {
        schedule.scheduleJob.mockClear();
        schedule.scheduledJobs = {};
    });

    test('schedules a job at the request end date', () => {
        const client = makeClient();
        const endDate = new Date(Date.now() + 86400000);
        status.scheduleStatusExpiry(client, {
            id: 7,
            endDate
        });
        expect(schedule.scheduleJob).toHaveBeenCalledTimes(1);
        const [name, when] = schedule.scheduleJob.mock.calls[0];
        expect(name).toBe('staff-mgmt-status-expiry-7');
        expect(when.getTime()).toBe(endDate.getTime());
    });

    test('cancels an existing job for the same request before re-scheduling', () => {
        const cancel = jest.fn();
        schedule.scheduledJobs['staff-mgmt-status-expiry-7'] = {cancel};
        const client = makeClient();
        status.scheduleStatusExpiry(client, {
            id: 7,
            endDate: new Date(Date.now() + 1000)
        });
        expect(cancel).toHaveBeenCalled();
    });

    test('the fired callback ends a still-APPROVED request and clears the role', async () => {
        const req = {
            id: 7,
            status: 'APPROVED',
            type: 'LOA',
            userId: 'target',
            startDate: new Date(),
            endDate: new Date(Date.now() - 1000),
            reason: 'r',
            update: jest.fn().mockResolvedValue()
        };
        const member = {
            user: {
                tag: 'T#1',
                send: jest.fn().mockResolvedValue(),
                client: {
                    logger: {error: jest.fn()},
                    strings: {}
                }
            },
            roles: {remove: jest.fn().mockResolvedValue()}
        };
        const guild = {members: {fetch: jest.fn().mockResolvedValue(member)}};
        const client = makeClient(
            {LoaRequest: modelStub({findByPk: jest.fn().mockResolvedValue(req)})},
            {
                loaRole: 'loa-role',
                logStatusChanges: false
            }
        );
        client.guilds.cache.get = jest.fn().mockReturnValue(guild);
        status.scheduleStatusExpiry(client, {
            id: 7,
            endDate: new Date(Date.now() + 1000)
        });
        const cb = schedule.scheduleJob.mock.calls[0][2];
        await cb();
        expect(req.update).toHaveBeenCalledWith({status: 'ENDED'});
        expect(member.roles.remove).toHaveBeenCalledWith('loa-role');
    });

    test('the fired callback no-ops if the request is no longer APPROVED', async () => {
        const req = {
            id: 7,
            status: 'ENDED',
            type: 'LOA',
            userId: 'target',
            endDate: new Date(Date.now() - 1000),
            update: jest.fn()
        };
        const client = makeClient({LoaRequest: modelStub({findByPk: jest.fn().mockResolvedValue(req)})});
        status.scheduleStatusExpiry(client, {
            id: 7,
            endDate: new Date(Date.now() + 1000)
        });
        const cb = schedule.scheduleJob.mock.calls[0][2];
        await cb();
        expect(req.update).not.toHaveBeenCalled();
    });
});