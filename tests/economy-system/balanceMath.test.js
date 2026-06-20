/*
 * Tests for the economy-system money math:
 *   editBalance  - add / remove (clamped at 0) / set, and an invalid action.
 *   editBank     - deposit (capped at the wallet balance) and
 *                  withdraw (capped at the bank, clamped at 0), which also move
 *                  money in/out of the wallet via editBalance.
 *   topTen       - sorts users by (balance + bank) desc and caps the list at 10.
 *
 * The Balance model and leaderboard side effects are stubbed. leaderboardChannel
 * is left empty so leaderboard() short-circuits and never touches Discord.
 */

const eco = require('../../modules/economy-system/economy-system');

/** A fake sequelize-ish balance row with a tracked save(). */
function makeRow(id, balance, bank) {
    return {
        id,
        balance,
        bank,
        save: jest.fn().mockResolvedValue()
    };
}

function makeClient(rows) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
        logger: {
            error: jest.fn(),
            fatal: jest.fn(),
            info: jest.fn()
        },
        configurations: {
            'economy-system': {
                config: {
                    leaderboardChannel: '',
                    currencySymbol: '$',
                    startMoney: 0
                }
            }
        },
        models: {
            'economy-system': {
                Balance: {
                    findOne: jest.fn(({where}) => Promise.resolve(byId.get(where.id) || null)),
                    create: jest.fn().mockResolvedValue(),
                    findAll: jest.fn().mockResolvedValue(rows)
                }
            }
        }
    };
}

describe('editBalance', () => {
    test('add increases the wallet', async () => {
        const row = makeRow('u1', 100, 0);
        await eco.editBalance(makeClient([row]), 'u1', 'add', 50);
        expect(row.balance).toBe(150);
        expect(row.save).toHaveBeenCalled();
    });

    test('remove decreases the wallet', async () => {
        const row = makeRow('u1', 100, 0);
        await eco.editBalance(makeClient([row]), 'u1', 'remove', 30);
        expect(row.balance).toBe(70);
    });

    test('remove clamps the wallet at zero (never negative)', async () => {
        const row = makeRow('u1', 20, 0);
        await eco.editBalance(makeClient([row]), 'u1', 'remove', 100);
        expect(row.balance).toBe(0);
    });

    test('set overwrites the wallet to an exact value', async () => {
        const row = makeRow('u1', 100, 0);
        await eco.editBalance(makeClient([row]), 'u1', 'set', 7);
        expect(row.balance).toBe(7);
    });

    test('an unknown action logs an error and does not save', async () => {
        const row = makeRow('u1', 100, 0);
        const client = makeClient([row]);
        await eco.editBalance(client, 'u1', 'bogus', 5);
        expect(client.logger.error).toHaveBeenCalled();
        expect(row.balance).toBe(100);
        expect(row.save).not.toHaveBeenCalled();
    });

    test('coerces string inputs numerically rather than concatenating', async () => {
        const row = makeRow('u1', '100', 0);
        await eco.editBalance(makeClient([row]), 'u1', 'add', '5');
        expect(row.balance).toBe(105);
    });
});

describe('editBank', () => {
    test('deposit moves money from wallet into the bank', async () => {
        const row = makeRow('u1', 100, 0);
        await eco.editBank(makeClient([row]), 'u1', 'deposit', 40);
        expect(row.bank).toBe(40);
        // editBalance('remove') was invoked, draining the wallet.
        expect(row.balance).toBe(60);
    });

    test('deposit of more than the wallet only banks the available balance', async () => {
        const row = makeRow('u1', 30, 0);
        await eco.editBank(makeClient([row]), 'u1', 'deposit', 1000);
        expect(row.bank).toBe(30);
        expect(row.balance).toBe(0);
    });

    test('withdraw moves money from the bank back into the wallet', async () => {
        const row = makeRow('u1', 0, 50);
        await eco.editBank(makeClient([row]), 'u1', 'withdraw', 20);
        expect(row.bank).toBe(30);
        expect(row.balance).toBe(20);
    });

    test('withdraw of more than the bank only withdraws what is there', async () => {
        const row = makeRow('u1', 0, 50);
        await eco.editBank(makeClient([row]), 'u1', 'withdraw', 999);
        expect(row.bank).toBe(0);
        expect(row.balance).toBe(50);
    });

    test('an unknown action logs an error', async () => {
        const row = makeRow('u1', 10, 10);
        const client = makeClient([row]);
        await eco.editBank(client, 'u1', 'bogus', 5);
        expect(client.logger.error).toHaveBeenCalled();
    });
});

describe('topTen', () => {
    const client = makeClient([]);

    test('sorts by combined wallet + bank, richest first', async () => {
        const rows = [
            {
                dataValues: {
                    id: 'a',
                    balance: 10,
                    bank: 0
                }
            },
            {
                dataValues: {
                    id: 'b',
                    balance: 100,
                    bank: 100
                }
            },
            {
                dataValues: {
                    id: 'c',
                    balance: 0,
                    bank: 50
                }
            }
        ];
        const out = await eco.topTen(rows, client);
        const order = out.trim().split('\n').map((l) => l.match(/<@!(\w+)>/)[1]);
        expect(order).toEqual(['b', 'c', 'a']);
        expect(out).toContain('200 $');
    });

    test('caps the leaderboard at ten entries', async () => {
        const rows = Array.from({length: 15}, (_, i) => ({
            dataValues: {
                id: `u${i}`,
                balance: i,
                bank: 0
            }
        }));
        const out = await eco.topTen(rows, client);
        expect(out.trim().split('\n')).toHaveLength(10);
    });

    test('returns undefined for an empty user set', async () => {
        expect(await eco.topTen([], client)).toBeUndefined();
    });
});