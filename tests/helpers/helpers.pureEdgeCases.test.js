/*
 * Deeper edge-case coverage for the pure string/number/array helpers, complementing
 * pureHelpers/pureMisc which assert the happy paths. Focuses on boundaries (exact-length
 * truncation, odd/even puffer parity, 5*i progressbar thresholds), unusual inputs and
 * the internal branches of compareArrays/parseEmbedColor/inputReplacer.
 */
const helpers = require('../../src/functions/helpers');
const {
    truncate,
    pufferStringToSize,
    compareArrays,
    renderProgressbar,
    parseEmbedColor,
    inputReplacer
} = helpers;

describe('truncate (edge cases)', () => {
    test('string exactly at the limit is returned unchanged', () => {
        expect(truncate('abcdefghij', 10)).toBe('abcdefghij');
    });

    test('string one over the limit is cut to length-3 plus ellipsis', () => {
        // length 11 > 10 -> substr(0, 7) "abcdefg" -> "abcdefg..."
        expect(truncate('abcdefghijk', 10)).toBe('abcdefg...');
    });

    test('trailing whitespace before the cut point is trimmed', () => {
        // "ab    cd" len 8 > 5 -> substr(0,2)="ab" trim -> "ab..."
        expect(truncate('ab    cd', 5)).toBe('ab...');
    });

    test('result length is length (cut text + 3 dots) for long input', () => {
        const out = truncate('x'.repeat(100), 20);
        expect(out).toHaveLength(20);
        expect(out.endsWith('...')).toBe(true);
    });

    test('zero is returned as-is (falsy guard)', () => {
        expect(truncate(0, 5)).toBe(0);
    });

    test('whitespace-only over-length collapses to just ellipsis after trim', () => {
        // 10 spaces, length 4 -> substr(0,1)=" " trim "" -> "..."
        expect(truncate('          ', 4)).toBe('...');
    });
});

describe('pufferStringToSize (edge cases)', () => {
    test('string longer than target size is returned unchanged (no negative loop)', () => {
        expect(pufferStringToSize('hello', 2)).toBe('hello');
    });

    test('adds exactly one leading nbsp when one char short (i=0 even -> prepend)', () => {
        const out = pufferStringToSize('ab', 3);
        expect(out).toBe('\xa0ab');
        expect(out).toHaveLength(3);
    });

    test('two short pads one leading and one trailing', () => {
        // i=0 even prepend, i=1 odd append
        expect(pufferStringToSize('ab', 4)).toBe('\xa0ab\xa0');
    });

    test('coerces boolean via toString', () => {
        const out = pufferStringToSize(true, 6);
        expect(out.includes('true')).toBe(true);
        expect(out).toHaveLength(6);
    });

    test('exact-size string is untouched', () => {
        expect(pufferStringToSize('exact', 5)).toBe('exact');
    });
});

describe('compareArrays (edge cases)', () => {
    test('two empty arrays are equal', () => {
        expect(compareArrays([], [])).toBe(true);
    });

    test('order-insensitive for primitives but length still matters', () => {
        expect(compareArrays([1, 1, 2], [2, 1, 1])).toBe(true);
    });

    test('duplicate-vs-distinct of same length: includes() makes them equal', () => {
        // Both length 2; each element of array1 is in array2 -> true (a known quirk).
        expect(compareArrays([1, 1], [1, 2])).toBe(true);
    });

    test('object compared against primitive at same index via key set', () => {
        // array1[0] is Object -> key path. keys of {} merged with keys of 5 (none) = none -> equal.
        expect(compareArrays([{}], [5])).toBe(true);
    });

    test('extra key present in only one object causes inequality', () => {
        expect(compareArrays([{
            a: 1,
            b: 2
        }], [{a: 1}])).toBe(false);
    });

    test('null vs missing key treated as equal (?? null)', () => {
        expect(compareArrays([{a: null}], [{}])).toBe(true);
    });

    test('nested object identity is shallow (keys compared by ===)', () => {
        const shared = {x: 1};
        expect(compareArrays([{a: shared}], [{a: shared}])).toBe(true);
        expect(compareArrays([{a: {x: 1}}], [{a: {x: 1}}])).toBe(false);
    });

    test('mixed object and primitive arrays compare per index', () => {
        expect(compareArrays([{a: 1}, 'b'], [{a: 1}, 'b'])).toBe(true);
    });
});

describe('renderProgressbar (edge cases)', () => {
    test('exactly 5% fills only the first cell', () => {
        // i=1: 5>=5 true; i>=2: 5>=10 false
        expect(renderProgressbar(5, 4)).toBe('█░░░');
    });

    test('threshold is inclusive at multiples of 5', () => {
        // 10% with length 4: i=1(>=5) i=2(>=10) fill; i=3,4 empty
        expect(renderProgressbar(10, 4)).toBe('██░░');
    });

    test('over-100 percentage fills the whole bar', () => {
        expect(renderProgressbar(250, 6)).toBe('██████');
    });

    test('negative percentage renders all empty', () => {
        expect(renderProgressbar(-10, 5)).toBe('░░░░░');
    });

    test('length 0 yields empty string', () => {
        expect(renderProgressbar(50, 0)).toBe('');
    });

    test('length 1 fills only when percentage >= 5', () => {
        expect(renderProgressbar(4, 1)).toBe('░');
        expect(renderProgressbar(5, 1)).toBe('█');
    });
});

describe('parseEmbedColor (edge cases)', () => {
    test('named GOLD and YELLOW share the same value', () => {
        expect(parseEmbedColor('GOLD')).toBe(parseEmbedColor('YELLOW'));
    });

    test('WHITE resolves to 0xFFFFFF', () => {
        expect(parseEmbedColor('WHITE')).toBe(0xFFFFFF);
    });

    test('hash hex with multiple hashes still parses (replaceAll)', () => {
        expect(parseEmbedColor('#ff0000')).toBe(0xff0000);
    });

    test('zero number passes through unchanged', () => {
        // 0 is falsy in colors[] lookup but typeof number short-circuits.
        expect(parseEmbedColor(0)).toBe(0);
    });

    test('non-hex string yields NaN via parseInt', () => {
        expect(Number.isNaN(parseEmbedColor('zzz'))).toBe(true);
    });

    test('lowercase color name is not in the table -> parsed as hex', () => {
        // 'red' is not a key; parseInt('red', 16) -> NaN
        expect(Number.isNaN(parseEmbedColor('red'))).toBe(true);
    });

    test('boolean returns the value unchanged (no branch matches)', () => {
        expect(parseEmbedColor(true)).toBe(true);
    });
});

describe('inputReplacer (edge cases)', () => {
    test('returnNull=false with empty args returns empty string for null', () => {
        expect(inputReplacer({}, null, false)).toBe('');
    });

    test('numeric arg value is interpolated as string', () => {
        expect(inputReplacer({'%n%': 0}, 'count=%n%')).toBe('count=0');
    });

    test('replaces overlapping placeholder names independently', () => {
        expect(inputReplacer({
            '%a%': 'X',
            '%ab%': 'Y'
        }, '%ab%-%a%')).toContain('Y');
    });

    test('returnNull=true returns null when all substitutions yield empty string', () => {
        // input '%x%' with x='' -> becomes '' -> returns null at the end
        expect(inputReplacer({'%x%': ''}, '%x%', true)).toBeNull();
    });

    test('mutates undefined arg values into empty string in place', () => {
        const args = {'%u%': undefined};
        inputReplacer(args, '%u%');
        expect(args['%u%']).toBe('');
    });

    test('returns non-empty string in returnNull mode when content remains', () => {
        expect(inputReplacer({'%x%': 'kept'}, '%x%', true)).toBe('kept');
    });

    test('input with no placeholders is returned verbatim', () => {
        expect(inputReplacer({'%a%': 'X'}, 'plain text')).toBe('plain text');
    });
});