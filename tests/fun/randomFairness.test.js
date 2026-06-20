/*
 * Randomness / fairness tests for the fun module's /random subcommands.
 *
 * Unlike tests/fun/random.test.js (which mocks the RNG to assert wiring), here
 * we use the REAL randomIntFromInterval / randomElementFromArray from helpers
 * and only mock embedType so we can read back the rolled value from the
 * interpolation args. This exercises the actual RNG path end to end:
 *   - /random number: inclusive bounds + roughly uniform over the range
 *   - dice: faces 1..6 all reachable + fair
 *   - coinflip: ~50/50 over the two sides
 *   - 8ball: covers every configured answer over N
 *
 * Statistical tolerances are loose and justified inline so the suite cannot
 * realistically flake.
 */
// Records only the most recent args (no growing history) so hot loops stay fast.
let lastArgs = null;
const mockEmbedType = (input, args) => {
    lastArgs = args;
    return {
        input,
        args
    };
};

// embedType is the only helper we replace; randomIntFromInterval and
// randomElementFromArray are the genuine implementations under test.
jest.mock('../../src/functions/helpers', () => {
    const actual = jest.requireActual('../../src/functions/helpers');
    return {
        ...actual,
        embedType: (input, args) => mockEmbedType(input, args)
    };
});
jest.mock('@scderox/ikea-name-generator', () => ({generateIkeaName: () => 'BJURSTA'}));

const {subcommands} = require('../../modules/fun/commands/random');

function makeInteraction(opts = {}) {
    const config = {
        randomNumberMessage: 'NUM',
        ikeaMessage: 'IKEA',
        diceRollMessage: 'DICE',
        coinFlipMessage: 'COIN',
        '8ballMessage': 'BALL',
        '8BallMessages': ['Yes', 'No', 'Maybe', 'Ask again']
    };
    return {
        reply: () => {
        },
        client: {configurations: {fun: {config}}},
        options: {getNumber: (name) => (name in opts ? opts[name] : null)}
    };
}

beforeEach(() => {
    lastArgs = null;
});

/** Runs a subcommand once against the given interaction and returns the rolled args. */
function rollArgs(sub, interaction) {
    sub(interaction);
    return lastArgs;
}

describe('/random number', () => {
    test('statistical: stays inside [3,8] inclusive, hits both ends, roughly uniform', () => {
        // Range 3..8 (6 values), N = 120_000 => expected 20_000 per value.
        // Requiring every value present and within +/-25% (sigma ~= 129) needs a
        // ~39-sigma miss to fail; false-failure probability <<1e-100.
        const N = 120_000;
        const interaction = makeInteraction({
            min: 3,
            max: 8
        });
        const counts = {};
        for (let i = 0; i < N; i++) {
            const n = rollArgs(subcommands.number, interaction)['%number%'];
            expect(n).toBeGreaterThanOrEqual(3);
            expect(n).toBeLessThanOrEqual(8);
            counts[n] = (counts[n] || 0) + 1;
        }
        const expected = N / 6;
        for (let v = 3; v <= 8; v++) {
            expect(counts[v]).toBeGreaterThan(0); // every value reachable incl. both bounds
            expect(counts[v]).toBeGreaterThan(expected * 0.75);
            expect(counts[v]).toBeLessThan(expected * 1.25);
        }
        expect(counts[3]).toBeGreaterThan(0);
        expect(counts[8]).toBeGreaterThan(0);
    });
});

describe('dice', () => {
    test('statistical: all six faces reachable and fair, never 0 or 7', () => {
        // N = 120_000 over 6 faces => expected 20_000 each. Same +/-25% / ~39-sigma
        // margin as above; cannot realistically flake.
        const N = 120_000;
        const interaction = makeInteraction();
        const counts = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < N; i++) {
            const n = rollArgs(subcommands.dice, interaction)['%number%'];
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(6);
            counts[n]++;
        }
        expect(counts[0]).toBe(0);
        expect(counts[7]).toBe(0);
        const expected = N / 6;
        for (let f = 1; f <= 6; f++) {
            expect(counts[f]).toBeGreaterThan(expected * 0.75);
            expect(counts[f]).toBeLessThan(expected * 1.25);
        }
    });
});

describe('coinflip', () => {
    test('statistical: ~50/50 between the two sides', () => {
        // A fair coin over N = 100_000 flips: each side expected 50_000, sigma ~= 158.
        // Requiring each side in [0.45, 0.55] is a 5000-count (~32-sigma) margin, so a
        // false failure is astronomically unlikely (<<1e-100). The localize stub maps
        // the two outcomes to "fun.dice-site-1" / "fun.dice-site-2".
        const N = 100_000;
        const interaction = makeInteraction();
        const counts = {};
        for (let i = 0; i < N; i++) {
            const site = rollArgs(subcommands.coinflip, interaction)['%site%'];
            counts[site] = (counts[site] || 0) + 1;
        }
        const sides = Object.keys(counts);
        expect(sides.sort()).toEqual(['fun.dice-site-1', 'fun.dice-site-2']);
        for (const side of sides) {
            const share = counts[side] / N;
            expect(share).toBeGreaterThan(0.45);
            expect(share).toBeLessThan(0.55);
        }
    });
});

describe('8ball', () => {
    test('statistical: covers every configured answer roughly uniformly', () => {
        // 4 answers, N = 80_000 => expected 20_000 each. +/-25% (sigma ~= 122) needs a
        // ~41-sigma deviation to fail; negligible false-failure probability.
        const N = 80_000;
        const interaction = makeInteraction();
        const counts = {};
        for (let i = 0; i < N; i++) {
            const answer = rollArgs(subcommands['8ball'], interaction)['%answer%'];
            counts[answer] = (counts[answer] || 0) + 1;
        }
        const pool = ['Yes', 'No', 'Maybe', 'Ask again'];
        const expected = N / pool.length;
        for (const answer of pool) {
            expect(counts[answer]).toBeGreaterThan(0);
            expect(counts[answer]).toBeGreaterThan(expected * 0.75);
            expect(counts[answer]).toBeLessThan(expected * 1.25);
        }
    });
});