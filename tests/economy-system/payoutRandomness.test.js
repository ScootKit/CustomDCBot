/*
 * Randomness / fairness tests for the economy-system payout RNG
 * (modules/economy-system/commands/economy-system.js).
 *
 * The economy core (editBalance/editBank/createLeaderboard) is mocked, but the
 * RNG helpers randomIntFromInterval / randomElementFromArray are the REAL
 * implementations so we exercise the genuine payout maths:
 *   - work credits a random amount within the configured [min,max] bounds
 *   - crime success credits a random amount within the configured bounds
 *   - crime is a ~50/50 win/lose coin flip (the success "chance")
 *
 * REGRESSION GUARD (previously a bug): work/crime used to call
 * randomIntFromInterval(maxMoney, minMoney) with the arguments swapped, which
 * collapsed the payout range to [min+1, max-1] - both configured endpoints were
 * unreachable. The source now passes (minMoney, maxMoney) correctly, so payouts
 * span the FULL inclusive [min, max]. These tests pin that corrected behaviour:
 * both configured endpoints must be reachable.
 *
 * Tolerances are loose and justified inline so the suite cannot realistically
 * flake.
 */
const mockEditBalance = jest.fn().mockResolvedValue();
const mockEditBank = jest.fn().mockResolvedValue();
const mockCreateLeaderboard = jest.fn().mockResolvedValue();
jest.mock('../../modules/economy-system/economy-system', () => ({
    editBalance: (...a) => mockEditBalance(...a),
    editBank: (...a) => mockEditBank(...a),
    createLeaderboard: (...a) => mockCreateLeaderboard(...a)
}));

// Real RNG; only embedType + formatDiscordUserName are replaced.
jest.mock('../../src/functions/helpers', () => {
    const actual = jest.requireActual('../../src/functions/helpers');
    return {
        ...actual,
        embedType: (input, args, opts) => ({
            input,
            args,
            opts
        }),
        formatDiscordUserName: (u) => (u && u.tag) || 'user'
    };
});

const cmd = require('../../modules/economy-system/commands/economy-system');

function makeModels() {
    // cooldown.findOne -> null means "no active cooldown" so the command proceeds
    // and a row is created; that lets us call the subcommand repeatedly.
    return {
        cooldown: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue()
        },
        Balance: {findOne: jest.fn().mockResolvedValue(null)}
    };
}

function makeInteraction(config = {}) {
    const baseConfig = {
        publicCommandReplies: true,
        currencySymbol: '$',
        workCooldown: 5,
        crimeCooldown: 5,
        minWorkMoney: 10,
        maxWorkMoney: 50,
        minCrimeMoney: 100,
        maxCrimeMoney: 200,
        ...config
    };
    const interaction = {
        user: {
            id: 'me',
            tag: 'Me#1',
            toString: () => '<@me>'
        },
        reply: () => {
        },
        options: {
            getUser: () => null,
            get: () => undefined
        },
        client: {
            config: {botOperators: []},
            logChannel: null,
            logger: {
                info: () => {
                },
                error: () => {
                }
            },
            configurations: {
                'economy-system': {
                    config: baseConfig,
                    strings: {
                        cooldown: 'COOLDOWN',
                        workSuccess: ['WORK %earned%'],
                        crimeSuccess: ['CRIME_WIN %earned%'],
                        crimeFail: ['CRIME_LOSE %loose%']
                    }
                }
            },
            models: {'economy-system': makeModels()}
        }
    };
    interaction.str = interaction.client.configurations['economy-system'].strings;
    interaction.config = interaction.client.configurations['economy-system'].config;
    return interaction;
}

/**
 * Runs `work` once and returns the amount credited via editBalance(add).
 * (cooldown.findOne resolves null each time, so every call proceeds.)
 */
async function runWork(config) {
    // Clear ALL module-level mocks each call: jest records every call (incl. the
    // full client object graph passed to createLeaderboard), so over tens of
    // thousands of iterations un-cleared mock.calls would retain that many client
    // graphs and exhaust the heap (CI OOM). Clearing keeps memory flat.
    mockEditBalance.mockClear();
    mockEditBank.mockClear();
    mockCreateLeaderboard.mockClear();
    const interaction = makeInteraction(config);
    await cmd.subcommands.work(interaction);
    const addCall = mockEditBalance.mock.calls.find(c => c[2] === 'add');
    return addCall ? addCall[3] : null;
}

describe('work payout bounds + coverage', () => {
    test('every payout stays within the configured [min,max] box and both endpoints are reachable', async () => {
        // Config min=10, max=50 => 41 inclusive outcomes. N = 30_000 runs. Every
        // payout must lie within [10,50] (hard invariant) and, now the arg-order bug
        // is fixed, the full span [10,50] must be observed. P(a given endpoint never
        // appears in 30k draws) = (40/41)^30000 ~ 1e-322, so this cannot flake.
        const N = 30_000;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < N; i++) {
            const amt = await runWork({
                minWorkMoney: 10,
                maxWorkMoney: 50
            });
            expect(amt).toBeGreaterThanOrEqual(10);
            expect(amt).toBeLessThanOrEqual(50);
            expect(Number.isInteger(amt)).toBe(true);
            if (amt < min) min = amt;
            if (amt > max) max = amt;
        }
        // Corrected span: both configured endpoints 10 and 50 are reachable.
        expect(min).toBe(10);
        expect(max).toBe(50);
    });

    test('statistical: payouts are roughly uniform across the full [min,max] range', async () => {
        // 41 outcomes in [10,50], N = 41_000 => expected 1000 each. Requiring every
        // outcome within +/-30% (sigma ~= 31) needs a ~10-sigma miss to fail;
        // false-failure probability is negligible (<<1e-20).
        const N = 41_000;
        const counts = {};
        for (let i = 0; i < N; i++) {
            const amt = await runWork({
                minWorkMoney: 10,
                maxWorkMoney: 50
            });
            counts[amt] = (counts[amt] || 0) + 1;
        }
        const expected = N / 41;
        for (let v = 10; v <= 50; v++) {
            expect(counts[v]).toBeGreaterThan(0);
            expect(counts[v]).toBeGreaterThan(expected * 0.7);
            expect(counts[v]).toBeLessThan(expected * 1.3);
        }
    });
});

describe('crime success probability + payout', () => {
    test('crime is a ~50/50 win/lose flip and wins pay within bounds', async () => {
        // crime branches on Math.floor(Math.random()*2): exactly a fair coin.
        // N = 60_000 => each side expected 30_000, sigma ~= 122. Requiring the win
        // share in [0.45,0.55] is a 3000-count (~24-sigma) margin; cannot flake.
        // On a win, editBalance(add) is called with randomIntFromInterval over the
        // crime bounds [100,200]; on a loss it is not (editBalance(remove) / editBank).
        const N = 60_000;
        let wins = 0;
        let winMin = Infinity;
        let winMax = -Infinity;
        for (let i = 0; i < N; i++) {
            mockEditBalance.mockClear();
            mockEditBank.mockClear();
            mockCreateLeaderboard.mockClear();
            const interaction = makeInteraction({
                minCrimeMoney: 100,
                maxCrimeMoney: 200
            });
            await cmd.subcommands.crime(interaction);
            const addCall = mockEditBalance.mock.calls.find(c => c[2] === 'add');
            if (addCall) {
                wins++;
                const amt = addCall[3];
                // Within the configured [100,200] box (hard invariant).
                expect(amt).toBeGreaterThanOrEqual(100);
                expect(amt).toBeLessThanOrEqual(200);
                if (amt < winMin) winMin = amt;
                if (amt > winMax) winMax = amt;
            }
        }
        const winShare = wins / N;
        expect(winShare).toBeGreaterThan(0.45);
        expect(winShare).toBeLessThan(0.55);
        // Arg-order bug fixed: the win-payout span is the full [100,200]; both
        // configured endpoints are reachable. Over ~30k wins both appear with
        // overwhelming probability.
        expect(winMin).toBe(100);
        expect(winMax).toBe(200);
    });
});