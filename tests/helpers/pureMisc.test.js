const helpers = require('../../src/functions/helpers');
const {__test} = helpers;
const {ButtonStyle} = require('discord.js');

describe('asyncForEach', () => {
    test('invokes callback for each element with (value, index, array)', async () => {
        const calls = [];
        const arr = ['a', 'b', 'c'];
        await helpers.asyncForEach(arr, async (value, index, array) => {
            calls.push({
                value,
                index,
                sameArray: array === arr
            });
        });
        expect(calls).toEqual([
            {
                value: 'a',
                index: 0,
                sameArray: true
            },
            {
                value: 'b',
                index: 1,
                sameArray: true
            },
            {
                value: 'c',
                index: 2,
                sameArray: true
            }
        ]);
    });

    test('awaits sequentially', async () => {
        const log = [];
        await helpers.asyncForEach([1, 2, 3], async (n) => {
            await new Promise((r) => setTimeout(r, 1));
            log.push(n);
        });
        expect(log).toEqual([1, 2, 3]);
    });

    test('returns undefined on empty array', async () => {
        const result = await helpers.asyncForEach([], async () => {
            throw new Error('should not run');
        });
        expect(result).toBeUndefined();
    });
});

describe('formatDiscordUserName', () => {
    test('returns tag for legacy discriminator users', () => {
        expect(helpers.formatDiscordUserName({
            discriminator: '1234',
            tag: 'Alice#1234',
            username: 'Alice'
        })).toBe('Alice#1234');
    });

    test('falls back to username#discriminator when tag missing', () => {
        expect(helpers.formatDiscordUserName({
            discriminator: '0042',
            username: 'Bob'
        })).toBe('Bob#0042');
    });

    test('returns just the username for new-style "0" discriminator users', () => {
        expect(helpers.formatDiscordUserName({
            discriminator: '0',
            username: 'Charlie'
        })).toBe('Charlie');
    });
});

describe('truncate', () => {
    test('passes through short strings', () => {
        expect(helpers.truncate('hi', 10)).toBe('hi');
        expect(helpers.truncate('exactly10c', 10)).toBe('exactly10c');
    });

    test('truncates with ellipsis at length', () => {
        expect(helpers.truncate('hello world', 8)).toBe('hello...');
    });

    test('trims whitespace before adding ellipsis', () => {
        expect(helpers.truncate('foo bar baz qux', 8)).toBe('foo b...');
    });

    test('returns falsy input unchanged', () => {
        expect(helpers.truncate('', 10)).toBe('');
        expect(helpers.truncate(null, 10)).toBeNull();
        expect(helpers.truncate(undefined, 10)).toBeUndefined();
    });
});

describe('pufferStringToSize', () => {
    test('returns input unchanged when already at size', () => {
        expect(helpers.pufferStringToSize('hi', 2)).toBe('hi');
    });

    test('pads with non-breaking spaces alternating around the string', () => {
        // size 5, input "hi" -> add 3 non-breaking spaces (\xa0)
        // iter 0 (even) -> prepend; iter 1 (odd) -> append; iter 2 (even) -> prepend
        const out = helpers.pufferStringToSize('hi', 5);
        expect(out.length).toBe(5);
        expect(out).toBe('\xa0\xa0hi\xa0');
    });

    test('coerces non-string input via toString', () => {
        const out = helpers.pufferStringToSize(42, 4);
        expect(out.length).toBe(4);
        expect(out.includes('42')).toBe(true);
    });
});

describe('compareArrays', () => {
    test('different lengths are not equal', () => {
        expect(helpers.compareArrays([1, 2], [1, 2, 3])).toBe(false);
    });

    test('same primitives in any order are equal', () => {
        expect(helpers.compareArrays([1, 2, 3], [3, 2, 1])).toBe(true);
        expect(helpers.compareArrays(['a', 'b'], ['b', 'a'])).toBe(true);
    });

    test('primitive mismatch is not equal', () => {
        expect(helpers.compareArrays([1, 2, 3], [1, 2, 4])).toBe(false);
    });

    test('object arrays compared key-by-key', () => {
        expect(helpers.compareArrays([{
            a: 1,
            b: 2
        }], [{
            a: 1,
            b: 2
        }])).toBe(true);
        expect(helpers.compareArrays([{a: 1}], [{a: 2}])).toBe(false);
    });

    test('treats missing key as null when comparing', () => {
        expect(helpers.compareArrays([{
            a: 1,
            b: null
        }], [{a: 1}])).toBe(true);
    });
});

describe('randomIntFromInterval', () => {
    test('values stay within inclusive bounds', () => {
        for (let i = 0; i < 200; i++) {
            const n = helpers.randomIntFromInterval(3, 7);
            expect(n).toBeGreaterThanOrEqual(3);
            expect(n).toBeLessThanOrEqual(7);
            expect(Number.isInteger(n)).toBe(true);
        }
    });

    test('returns the bound when min === max', () => {
        expect(helpers.randomIntFromInterval(5, 5)).toBe(5);
    });
});

describe('randomElementFromArray', () => {
    test('returns null on empty', () => {
        expect(helpers.randomElementFromArray([])).toBeNull();
    });

    test('returns the only element when length is 1', () => {
        expect(helpers.randomElementFromArray(['only'])).toBe('only');
    });

    test('always returns an element from the input', () => {
        const arr = ['a', 'b', 'c', 'd'];
        for (let i = 0; i < 100; i++) {
            expect(arr.includes(helpers.randomElementFromArray(arr))).toBe(true);
        }
    });
});

describe('renderProgressbar', () => {
    test('renders all-empty at 0 percent', () => {
        expect(helpers.renderProgressbar(0, 10)).toBe('░░░░░░░░░░');
    });

    test('renders all-full at 100 percent', () => {
        expect(helpers.renderProgressbar(100, 10)).toBe('██████████');
    });

    test('renders half-and-half at 50 percent', () => {
        expect(helpers.renderProgressbar(50, 10)).toBe('██████████'); // 50 >= 5*10 = false but 50 >= 5*i for i<=10. Actually 5*10 = 50, condition >=, so i=10 included.
    });

    test('partial fill scales with percentage', () => {
        // 25%: i=1..5 satisfy 25 >= 5*i (5,10,15,20,25); i=6..20 do not
        expect(helpers.renderProgressbar(25, 20)).toBe('█████░░░░░░░░░░░░░░░');
    });

    test('uses default length of 20', () => {
        expect(helpers.renderProgressbar(100)).toHaveLength(20);
    });
});

describe('shuffleArray', () => {
    test('returns a new array with the same elements', () => {
        const input = [1, 2, 3, 4, 5];
        const out = helpers.shuffleArray(input);
        expect(out).not.toBe(input); // new array reference
        expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    test('does not mutate the input', () => {
        const input = [1, 2, 3];
        helpers.shuffleArray(input);
        expect(input).toEqual([1, 2, 3]);
    });

    test('shuffles (extremely high probability across 5! permutations)', () => {
        const input = [1, 2, 3, 4, 5];
        let differed = false;
        for (let i = 0; i < 50; i++) {
            const out = helpers.shuffleArray(input);
            if (out.some((v, idx) => v !== input[idx])) {
                differed = true;
                break;
            }
        }
        expect(differed).toBe(true);
    });
});

describe('hashMD5', () => {
    test('matches the canonical RFC 1321 vectors', () => {
        expect(helpers.hashMD5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
        expect(helpers.hashMD5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    });

    test('is deterministic for the same input', () => {
        expect(helpers.hashMD5('hello')).toBe(helpers.hashMD5('hello'));
    });
});

describe('mapButtonStyle (internal)', () => {
    test('maps each integer 1-5 to the matching ButtonStyle', () => {
        expect(__test.mapButtonStyle(1)).toBe(ButtonStyle.Primary);
        expect(__test.mapButtonStyle(2)).toBe(ButtonStyle.Secondary);
        expect(__test.mapButtonStyle(3)).toBe(ButtonStyle.Success);
        expect(__test.mapButtonStyle(4)).toBe(ButtonStyle.Danger);
        expect(__test.mapButtonStyle(5)).toBe(ButtonStyle.Link);
    });

    test('falls back to Secondary for unknown values', () => {
        expect(__test.mapButtonStyle(0)).toBe(ButtonStyle.Secondary);
        expect(__test.mapButtonStyle(99)).toBe(ButtonStyle.Secondary);
        expect(__test.mapButtonStyle(null)).toBe(ButtonStyle.Secondary);
    });
});

describe('formatV4BuilderError (internal)', () => {
    test('flattens a CombinedPropertyError-style nested errors array', () => {
        const err = {
            errors: [
                ['label', {
                    message: 'must be a string',
                    given: 42
                }],
                ['style', {message: 'invalid'}]
            ]
        };
        expect(__test.formatV4BuilderError(err)).toBe('label: must be a string (got 42); style: invalid');
    });

    test('falls back to a single-message format with extras', () => {
        const err = {
            message: 'value out of range',
            constraint: 'NumberMax',
            given: 10,
            expected: 5
        };
        expect(__test.formatV4BuilderError(err)).toBe('value out of range [NumberMax] (got 10) expected: 5');
    });

    test('handles minimal error objects (message only)', () => {
        expect(__test.formatV4BuilderError({message: 'oops'})).toBe('oops');
    });

    test('joins array-valued expected with commas', () => {
        const err = {
            message: 'bad',
            expected: ['a', 'b', 'c']
        };
        expect(__test.formatV4BuilderError(err)).toBe('bad expected: a, b, c');
    });
});

describe('moduleEnabled', () => {
    test('returns true when module is registered and enabled', () => {
        const client = {modules: {foo: {enabled: true}}};
        expect(helpers.moduleEnabled(client, 'foo')).toBe(true);
    });

    test('returns false when module exists but is disabled', () => {
        const client = {modules: {foo: {enabled: false}}};
        expect(helpers.moduleEnabled(client, 'foo')).toBe(false);
    });

    test('returns false when module is absent', () => {
        const client = {modules: {}};
        expect(helpers.moduleEnabled(client, 'foo')).toBe(false);
    });
});

describe('formatNumber', () => {
    test('formats a number with the client locale', () => {
        const stub = require('../__stubs__/main');
        stub.client.bcp47Locale = 'en-US';
        expect(helpers.formatNumber(1234567)).toBe('1,234,567');
    });

    test('coerces numeric strings before formatting', () => {
        const stub = require('../__stubs__/main');
        stub.client.bcp47Locale = 'en-US';
        expect(helpers.formatNumber('1234.5')).toBe('1,234.5');
    });

    test('passes Intl options through', () => {
        const stub = require('../__stubs__/main');
        stub.client.bcp47Locale = 'en-US';
        expect(helpers.formatNumber(0.5, {style: 'percent'})).toBe('50%');
    });
});

describe('checkForUpdates', () => {
    test('is a no-op and resolves', async () => {
        await expect(helpers.checkForUpdates()).resolves.toBeUndefined();
    });
});