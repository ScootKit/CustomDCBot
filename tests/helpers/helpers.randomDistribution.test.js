/*
 * Randomness / fairness tests for the RNG primitives in src/functions/helpers.js:
 *   randomIntFromInterval, randomElementFromArray, shuffleArray, randomString.
 *
 * The helpers use crypto.randomInt (secure, unbiased) under the hood. Two
 * complementary techniques are used:
 *  1. Deterministic boundary/property tests pin crypto.randomInt at its lowest
 *     and highest legal return value to PROVE inclusive bounds and the absence
 *     of off-by-one / out-of-range bugs. These never flake.
 *  2. Statistical fairness tests run the REAL (unmocked) crypto RNG over a large
 *     N and assert distribution properties with deliberately loose tolerances.
 *     Each such test carries a comment explaining why a false failure is
 *     astronomically unlikely.
 */
const crypto = require('crypto');
const {
    randomIntFromInterval,
    randomElementFromArray,
    shuffleArray,
    randomString
} = require('../../src/functions/helpers');

afterEach(() => jest.restoreAllMocks());

// crypto.randomInt shapes: randomInt(max) -> [0,max-1]; randomInt(min,maxEx) -> [min,maxEx-1].
const MIN = (a, b) => (b === undefined ? 0 : a);          // lowest legal value
const MAX = (a, b) => (b === undefined ? a - 1 : b - 1);  // highest legal value

describe('randomIntFromInterval - boundary / off-by-one', () => {
    test('lowest draw yields exactly the lower bound', () => {
        jest.spyOn(crypto, 'randomInt').mockImplementation(MIN);
        expect(randomIntFromInterval(1, 6)).toBe(1);
        expect(randomIntFromInterval(0, 0)).toBe(0);
        expect(randomIntFromInterval(-3, 3)).toBe(-3);
    });

    test('highest draw yields exactly the upper bound', () => {
        jest.spyOn(crypto, 'randomInt').mockImplementation(MAX);
        expect(randomIntFromInterval(1, 6)).toBe(6);
        expect(randomIntFromInterval(-3, 3)).toBe(3);
        expect(randomIntFromInterval(10, 10)).toBe(10);
    });

    test('min===max always returns that single value without drawing', () => {
        const spy = jest.spyOn(crypto, 'randomInt');
        expect(randomIntFromInterval(7, 7)).toBe(7);
        expect(spy).not.toHaveBeenCalled();
    });

    test('every face of a d6 is reachable and never 0 or 7 (deterministic sweep)', () => {
        // Feed each legal in-range result; the helper returns crypto.randomInt(1,7)
        // straight through, so we prove every face 1..6 maps correctly and the
        // extremes are reachable.
        const queue = [1, 2, 3, 4, 5, 6, 6, 1];
        let i = 0;
        jest.spyOn(crypto, 'randomInt').mockImplementation(() => queue[i++ % queue.length]);
        const seen = new Set();
        for (let k = 0; k < queue.length; k++) {
            const v = randomIntFromInterval(1, 6);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(6);
            seen.add(v);
        }
        expect(seen.has(1)).toBe(true);
        expect(seen.has(6)).toBe(true);
    });

    test('statistical: a d6 over 120k rolls covers all faces and stays roughly uniform', () => {
        // N = 120_000, k = 6 buckets => expected 20_000 each. We only require every
        // face to appear and each count within +/-25% of expectation. With sigma ~= 129,
        // a 25% (5000-count) deviation is ~39 standard deviations away; the chance of
        // a false failure is far below 1e-100, so this cannot realistically flake.
        const N = 120_000;
        const counts = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < N; i++) {
            const v = randomIntFromInterval(1, 6);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(6);
            counts[v]++;
        }
        expect(counts[0]).toBe(0); // never below the range
        expect(counts[7]).toBe(0); // never above the range
        const expected = N / 6;
        for (let face = 1; face <= 6; face++) {
            expect(counts[face]).toBeGreaterThan(expected * 0.75);
            expect(counts[face]).toBeLessThan(expected * 1.25);
        }
    });
});

describe('randomElementFromArray - boundary / short-circuits', () => {
    test('empty array returns null', () => {
        expect(randomElementFromArray([])).toBeNull();
    });

    test('single-element array short-circuits to that element (no draw)', () => {
        const spy = jest.spyOn(crypto, 'randomInt');
        expect(randomElementFromArray(['only'])).toBe('only');
        expect(spy).not.toHaveBeenCalled();
    });

    test('index 0 picks the first element; the last index picks the last', () => {
        const arr = ['a', 'b', 'c', 'd'];
        jest.spyOn(crypto, 'randomInt').mockImplementation(MIN);
        expect(randomElementFromArray(arr)).toBe('a');
        crypto.randomInt.mockImplementation(MAX);
        expect(randomElementFromArray(arr)).toBe('d'); // never out of bounds
    });

    test('statistical: every index of a 5-element array is reachable and ~uniform', () => {
        // N = 100_000, k = 5 => expected 20_000 each. Requiring counts within +/-25%
        // (a 5000 deviation) when sigma ~= 126 means a ~39-sigma event would be needed
        // to fail; false-failure probability is negligible (<<1e-100).
        const arr = ['a', 'b', 'c', 'd', 'e'];
        const N = 100_000;
        const counts = {
            a: 0,
            b: 0,
            c: 0,
            d: 0,
            e: 0
        };
        for (let i = 0; i < N; i++) counts[randomElementFromArray(arr)]++;
        const expected = N / arr.length;
        for (const key of arr) {
            expect(counts[key]).toBeGreaterThan(0);
            expect(counts[key]).toBeGreaterThan(expected * 0.75);
            expect(counts[key]).toBeLessThan(expected * 1.25);
        }
    });
});

describe('shuffleArray', () => {
    test('returns a permutation (same multiset) and does not mutate the input', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const snapshot = [...input];
        for (let i = 0; i < 1000; i++) {
            const out = shuffleArray(input);
            expect(out).toHaveLength(input.length);
            expect([...out].sort((a, b) => a - b)).toEqual(snapshot);
        }
        // Contract: input is copied, never mutated.
        expect(input).toEqual(snapshot);
    });

    test('handles empty and single-element arrays', () => {
        expect(shuffleArray([])).toEqual([]);
        expect(shuffleArray([42])).toEqual([42]);
    });

    test('statistical: no positional bias - every element reaches every position', () => {
        // 6 elements, N = 60_000 shuffles => each (element, position) pair expected
        // 10_000 times. We only require every pair to occur at least once and land
        // within +/-25% of expectation. sigma ~= 91 per cell, so a 2500 deviation is
        // ~27 sigma; a false failure is astronomically unlikely (<<1e-100). This also
        // catches the classic biased-shuffle bug where index 0 or the last index is
        // disproportionately likely to stay put.
        const base = ['x0', 'x1', 'x2', 'x3', 'x4', 'x5'];
        const N = 60_000;
        const grid = base.map(() => ({
            x0: 0,
            x1: 0,
            x2: 0,
            x3: 0,
            x4: 0,
            x5: 0
        }));
        for (let i = 0; i < N; i++) {
            const out = shuffleArray(base);
            for (let pos = 0; pos < out.length; pos++) grid[pos][out[pos]]++;
        }
        const expected = N / base.length;
        for (let pos = 0; pos < base.length; pos++) {
            for (const el of base) {
                expect(grid[pos][el]).toBeGreaterThan(0);
                expect(grid[pos][el]).toBeGreaterThan(expected * 0.75);
                expect(grid[pos][el]).toBeLessThan(expected * 1.25);
            }
        }
    });
});

describe('randomString', () => {
    test('boundary: length 0 returns empty string', () => {
        expect(randomString(0)).toBe('');
    });

    test('lowest draw selects the first charset char; the highest selects the last', () => {
        jest.spyOn(crypto, 'randomInt').mockImplementation(MIN);
        expect(randomString(5, 'ABCDE')).toBe('AAAAA');
        crypto.randomInt.mockImplementation(MAX);
        expect(randomString(5, 'ABCDE')).toBe('EEEEE'); // last char, never out of range
    });

    test('output has the requested length and uses only the charset', () => {
        expect(randomString(256)).toHaveLength(256);
        expect(randomString(500, 'AB')).toMatch(/^[AB]+$/);
    });

    test('statistical: char distribution over a long string is roughly uniform', () => {
        // A 100_000-char string over a 10-char alphabet => expected 10_000 per char.
        // Requiring each within +/-25% (sigma ~= 95) means a ~26-sigma deviation would
        // be needed to fail; false-failure probability is negligible (<<1e-100).
        const charset = '0123456789';
        const N = 100_000;
        const out = randomString(N, charset);
        expect(out).toHaveLength(N);
        const counts = {};
        for (const ch of charset) counts[ch] = 0;
        for (const ch of out) {
            expect(charset.includes(ch)).toBe(true); // only expected charset, never undefined
            counts[ch]++;
        }
        const expected = N / charset.length;
        for (const ch of charset) {
            expect(counts[ch]).toBeGreaterThan(expected * 0.75);
            expect(counts[ch]).toBeLessThan(expected * 1.25);
        }
    });
});