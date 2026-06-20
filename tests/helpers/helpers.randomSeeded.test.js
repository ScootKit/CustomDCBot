/*
 * Deterministic-behavior tests for the randomness helpers. The helpers now use
 * crypto.randomInt (cryptographically secure, unbiased) instead of Math.random,
 * so we pin crypto.randomInt via a spy to assert the EXACT element/index/char
 * each function picks and the Fisher-Yates swap order.
 *
 * crypto.randomInt has two call shapes the helpers use:
 *   randomInt(max)        -> integer in [0, max-1]      (single arg)
 *   randomInt(min, maxEx) -> integer in [min, maxEx-1]  (two args)
 * The MIN/MAX helpers below return the lowest / highest legal value for either
 * shape, which is how we prove inclusive bounds without off-by-one.
 */
const crypto = require('crypto');
const {
    randomIntFromInterval,
    randomElementFromArray,
    shuffleArray,
    randomString
} = require('../../src/functions/helpers');

afterEach(() => jest.restoreAllMocks());

function mockInt(fn) {
    return jest.spyOn(crypto, 'randomInt').mockImplementation(fn);
}

const MIN = (a, b) => (b === undefined ? 0 : a);          // lowest value in range
const MAX = (a, b) => (b === undefined ? a - 1 : b - 1);  // highest value in range

describe('randomIntFromInterval (seeded)', () => {
    test('lowest draw yields min', () => {
        mockInt(MIN);
        expect(randomIntFromInterval(3, 7)).toBe(3);
    });

    test('highest draw yields max', () => {
        mockInt(MAX);
        expect(randomIntFromInterval(3, 7)).toBe(7);
    });

    test('a specific draw maps straight through', () => {
        mockInt(() => 5);
        expect(randomIntFromInterval(3, 7)).toBe(5);
    });

    test('supports negative ranges', () => {
        mockInt(MIN);
        expect(randomIntFromInterval(-10, -5)).toBe(-10);
        jest.restoreAllMocks();
        mockInt(MAX);
        expect(randomIntFromInterval(-10, -5)).toBe(-5);
    });

    test('spanning zero returns 0 at the right draw', () => {
        mockInt(() => 0);
        expect(randomIntFromInterval(-2, 2)).toBe(0);
    });

    test('min===max returns that value without drawing', () => {
        const spy = mockInt(() => 999);
        expect(randomIntFromInterval(7, 7)).toBe(7);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('randomElementFromArray (seeded)', () => {
    test('index 0 returns first element', () => {
        mockInt(MIN);
        expect(randomElementFromArray(['a', 'b', 'c', 'd'])).toBe('a');
    });

    test('last index returns last element', () => {
        mockInt(MAX);
        expect(randomElementFromArray(['a', 'b', 'c', 'd'])).toBe('d');
    });

    test('a middle index selects the middle element', () => {
        mockInt(() => 2);
        expect(randomElementFromArray(['a', 'b', 'c', 'd'])).toBe('c');
    });

    test('single-element array short-circuits without drawing', () => {
        const spy = mockInt(() => 0);
        expect(randomElementFromArray(['only'])).toBe('only');
        expect(spy).not.toHaveBeenCalled();
    });

    test('empty array short-circuits to null without drawing', () => {
        const spy = mockInt(() => 0);
        expect(randomElementFromArray([])).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('shuffleArray (seeded Fisher-Yates)', () => {
    test('all-zero draws rotate elements predictably', () => {
        // j=0 every iteration so each element i swaps with index 0:
        // [1,2,3,4] -> i3 swap(3,0) [4,2,3,1] -> i2 swap(2,0) [3,2,4,1]
        //           -> i1 swap(1,0) [2,3,4,1] -> i0 swap(0,0) [2,3,4,1]
        mockInt(MIN);
        expect(shuffleArray([1, 2, 3, 4])).toEqual([2, 3, 4, 1]);
    });

    test('identity permutation when each j equals i (highest draw)', () => {
        // randomInt(i+1) returning its max (i) swaps every element with itself.
        mockInt(MAX);
        expect(shuffleArray([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    });

    test('does not mutate input', () => {
        mockInt(MIN);
        const input = [1, 2, 3, 4];
        shuffleArray(input);
        expect(input).toEqual([1, 2, 3, 4]);
    });

    test('empty and single-element arrays pass through', () => {
        mockInt(MIN);
        expect(shuffleArray([])).toEqual([]);
        expect(shuffleArray([99])).toEqual([99]);
    });
});

describe('randomString (seeded)', () => {
    test('lowest draw always picks the first char of the charset', () => {
        mockInt(MIN);
        expect(randomString(5, 'XYZ')).toBe('XXXXX');
    });

    test('alternating draws map to deterministic characters', () => {
        const seq = [0, 1];
        let i = 0;
        mockInt(() => seq[i++ % seq.length]);
        expect(randomString(4, 'AB')).toBe('ABAB');
    });

    test('highest draw selects the final char of the charset', () => {
        mockInt(MAX);
        expect(randomString(3, 'ABC')).toBe('CCC');
    });

    test('length 0 returns empty without drawing', () => {
        const spy = mockInt(() => 0);
        expect(randomString(0, 'AB')).toBe('');
        expect(spy).not.toHaveBeenCalled();
    });
});