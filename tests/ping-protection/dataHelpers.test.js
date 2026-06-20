/*
 * Tests for ping-protection's data-layer helpers not covered elsewhere:
 *  - addPing: in-memory debounce + DB duplicate-window guard, automod widening
 *    the window to 5s, and the 'Blocked by AutoMod' messageUrl fallback.
 *  - getPingCountInWindow: count query with a day-based cutoff.
 *  - fetchPingHistory / fetchModHistory: pagination shape + graceful handling
 *    of a missing ModerationLog model and a thrown query.
 *  - leaver helpers: markUserAsLeft (upsert) / markUserAsRejoined (destroy) /
 *    getLeaverStatus (findByPk).
 *  - deleteAllUserData fans out to executeDataDeletion + logs.
 *  - enforceRetention prunes ping history, mod logs, and leaver data per config.
 */
jest.useFakeTimers();
const pp = require('../../modules/ping-protection/ping-protection');

function makeClient({
                        storage = {},
                        configuration = {enableAutomod: false},
                        models = {}
                    } = {}) {
    return {
        logger: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn()
        },
        configurations: {
            'ping-protection': {
                configuration,
                storage
            }
        },
        models: {'ping-protection': models}
    };
}

describe('addPing', () => {
    test('creates a ping history row when no duplicate exists', async () => {
        const create = jest.fn().mockResolvedValue();
        const findOne = jest.fn().mockResolvedValue(null);
        const client = makeClient({
            models: {
                PingHistory: {
                    create,
                    findOne
                }
            }
        });
        await pp.addPing(client, 'u1', 'http://msg', 't1', false);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'u1',
            messageUrl: 'http://msg',
            targetId: 't1',
            isRole: false
        }));
    });

    test('falls back to the AutoMod label when messageUrl is missing', async () => {
        const create = jest.fn().mockResolvedValue();
        const client = makeClient({
            models: {
                PingHistory: {
                    create,
                    findOne: jest.fn().mockResolvedValue(null)
                }
            }
        });
        await pp.addPing(client, 'u2', null, 't1', true);
        expect(create.mock.calls[0][0].messageUrl).toBe('Blocked by AutoMod');
    });

    test('skips the DB write when a recent duplicate exists', async () => {
        const create = jest.fn().mockResolvedValue();
        const client = makeClient({
            models: {
                PingHistory: {
                    create,
                    findOne: jest.fn().mockResolvedValue({id: 1})
                }
            }
        });
        await pp.addPing(client, 'u3', 'url', 't1', false);
        expect(create).not.toHaveBeenCalled();
    });

    test('in-memory debounce suppresses a rapid second call for the same pair', async () => {
        const create = jest.fn().mockResolvedValue();
        const findOne = jest.fn().mockResolvedValue(null);
        const client = makeClient({
            models: {
                PingHistory: {
                    create,
                    findOne
                }
            }
        });
        await pp.addPing(client, 'dbU', 'url', 'dbT', false);
        await pp.addPing(client, 'dbU', 'url', 'dbT', false); // within window -> debounced
        expect(create).toHaveBeenCalledTimes(1);
        // after the window the debounce key is released
        jest.advanceTimersByTime(2000);
        await pp.addPing(client, 'dbU', 'url', 'dbT', false);
        expect(create).toHaveBeenCalledTimes(2);
    });
});

describe('getPingCountInWindow', () => {
    test('counts pings newer than the day-based cutoff', async () => {
        const count = jest.fn().mockResolvedValue(7);
        const client = makeClient({models: {PingHistory: {count}}});
        const result = await pp.getPingCountInWindow(client, 'u1', 14);
        expect(result).toBe(7);
        const where = count.mock.calls[0][0].where;
        expect(where.userId).toBe('u1');
        expect(where.createdAt).toBeDefined();
    });
});

describe('fetchPingHistory', () => {
    test('passes pagination and returns total + rows', async () => {
        const findAndCountAll = jest.fn().mockResolvedValue({
            count: 12,
            rows: [{id: 1}]
        });
        const client = makeClient({models: {PingHistory: {findAndCountAll}}});
        const res = await pp.fetchPingHistory(client, 'u1', 3, 5);
        expect(findAndCountAll.mock.calls[0][0]).toMatchObject({
            limit: 5,
            offset: 10
        });
        expect(res).toEqual({
            total: 12,
            history: [{id: 1}]
        });
    });
});

describe('fetchModHistory', () => {
    test('returns empty when the ModerationLog model is missing', async () => {
        const client = makeClient({models: {}});
        const res = await pp.fetchModHistory(client, 'u1');
        expect(res).toEqual({
            total: 0,
            history: []
        });
    });

    test('returns rows when the query succeeds', async () => {
        const findAndCountAll = jest.fn().mockResolvedValue({
            count: 2,
            rows: [{type: 'MUTE'}]
        });
        const client = makeClient({models: {ModerationLog: {findAndCountAll}}});
        const res = await pp.fetchModHistory(client, 'u1', 1, 5);
        expect(res).toEqual({
            total: 2,
            history: [{type: 'MUTE'}]
        });
    });

    test('warns and returns empty when the query throws', async () => {
        const findAndCountAll = jest.fn().mockRejectedValue(new Error('db down'));
        const client = makeClient({models: {ModerationLog: {findAndCountAll}}});
        const res = await pp.fetchModHistory(client, 'u1');
        expect(res).toEqual({
            total: 0,
            history: []
        });
        expect(client.logger.warn).toHaveBeenCalled();
    });
});

describe('leaver helpers', () => {
    test('markUserAsLeft upserts with a timestamp', async () => {
        const upsert = jest.fn().mockResolvedValue();
        const client = makeClient({models: {LeaverData: {upsert}}});
        await pp.markUserAsLeft(client, 'u1');
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({userId: 'u1'}));
        expect(upsert.mock.calls[0][0].leftAt).toBeInstanceOf(Date);
    });

    test('markUserAsRejoined destroys the leaver row', async () => {
        const destroy = jest.fn().mockResolvedValue();
        const client = makeClient({models: {LeaverData: {destroy}}});
        await pp.markUserAsRejoined(client, 'u1');
        expect(destroy).toHaveBeenCalledWith({where: {userId: 'u1'}});
    });

    test('getLeaverStatus reads by primary key', async () => {
        const findByPk = jest.fn().mockResolvedValue({userId: 'u1'});
        const client = makeClient({models: {LeaverData: {findByPk}}});
        const res = await pp.getLeaverStatus(client, 'u1');
        expect(findByPk).toHaveBeenCalledWith('u1');
        expect(res).toEqual({userId: 'u1'});
    });
});

describe('deleteAllUserData', () => {
    test('wipes everything and logs', async () => {
        const models = {
            PingHistory: {destroy: jest.fn().mockResolvedValue()},
            ModerationLog: {destroy: jest.fn().mockResolvedValue()},
            LeaverData: {destroy: jest.fn().mockResolvedValue()}
        };
        const client = makeClient({models});
        await pp.deleteAllUserData(client, 'u1');
        expect(models.PingHistory.destroy).toHaveBeenCalled();
        expect(models.ModerationLog.destroy).toHaveBeenCalled();
        expect(models.LeaverData.destroy).toHaveBeenCalled();
        expect(client.logger.info).toHaveBeenCalled();
    });
});

describe('enforceRetention', () => {
    test('does nothing without a storage config', async () => {
        const client = makeClient({storage: null});
        await expect(pp.enforceRetention(client)).resolves.toBeUndefined();
    });

    test('prunes ping history older than the retention window (bulk mode)', async () => {
        const destroy = jest.fn().mockResolvedValue();
        const client = makeClient({
            storage: {
                enablePingHistory: true,
                pingHistoryRetention: 4,
                deleteAllPingHistoryAfterTimeframe: false
            },
            models: {
                PingHistory: {
                    destroy,
                    findAll: jest.fn()
                }
            }
        });
        await pp.enforceRetention(client);
        expect(destroy).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({createdAt: expect.anything()})}));
    });

    test('wipes all data for users with expired pings when configured', async () => {
        const phDestroy = jest.fn().mockResolvedValue();
        const findAll = jest.fn().mockResolvedValue([{userId: 'a'}, {userId: 'b'}]);
        const client = makeClient({
            storage: {
                enablePingHistory: true,
                deleteAllPingHistoryAfterTimeframe: true
            },
            models: {
                PingHistory: {
                    destroy: phDestroy,
                    findAll
                }
            }
        });
        await pp.enforceRetention(client);
        expect(phDestroy).toHaveBeenCalledWith({where: {userId: ['a', 'b']}});
    });

    test('deletes expired leaver rows and their data', async () => {
        const leaver = {
            userId: 'gone',
            destroy: jest.fn().mockResolvedValue()
        };
        const models = {
            PingHistory: {destroy: jest.fn().mockResolvedValue()},
            ModerationLog: {destroy: jest.fn().mockResolvedValue()},
            LeaverData: {
                findAll: jest.fn().mockResolvedValue([leaver]),
                destroy: jest.fn().mockResolvedValue()
            }
        };
        const client = makeClient({
            storage: {
                enableLeaverDataRetention: true,
                leaverRetention: 1
            },
            models
        });
        await pp.enforceRetention(client);
        expect(leaver.destroy).toHaveBeenCalled();
        expect(client.logger.info).toHaveBeenCalled(); // deleteAllUserData logged
    });
});