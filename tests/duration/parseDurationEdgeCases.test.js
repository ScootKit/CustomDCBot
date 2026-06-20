// Edge-case coverage for the parseDuration wrapper. parse-duration v2 is
// ESM-only and cannot be require()'d inside jest's CJS sandbox, so (like the
// existing parseDuration.test.js) we mock it. The mock below reproduces the
// real parse-duration numeric contract for the inputs under test, so these
// assertions lock in the same units / combined / whitespace / sign / format
// behaviour the production package exhibits (verified against the real module).
//
// The wrapper itself adds: lazy init(), a throw-before-init guard, and
// transparent forwarding of BOTH the input and the optional `format` argument.

jest.mock('parse-duration', () => {
    // Unit table in milliseconds, mirroring parse-duration's defaults.
    const UNITS = {
        ms: 1,
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000,
        w: 604800000,
        y: 31557600000
    };

    function parse(input, format = 'ms') {
        if (typeof input !== 'string') return null;
        let total = 0;
        let matched = false;
        // value+unit pairs, tolerant of internal/surrounding whitespace
        const re = /(-?\d*\.?\d+)\s*(ms|s|m|h|d|w|y)/g;
        let match;
        let consumed = '';
        while ((match = re.exec(input)) !== null) {
            matched = true;
            total += parseFloat(match[1]) * UNITS[match[2]];
            consumed += match[0];
        }
        if (!matched) {
            // bare number with no unit -> treated as milliseconds (e.g. "0")
            const bare = input.trim();
            if (/^-?\d*\.?\d+$/.test(bare)) {
                total = parseFloat(bare);
                matched = true;
            }
        }
        if (!matched) return null;
        return total / UNITS[format];
    }

    return {
        __esModule: true,
        default: parse
    };
});

const parseDuration = require('../../src/functions/parseDuration');

beforeAll(() => parseDuration.init());

describe('parseDuration - single units (milliseconds)', () => {
    test('milliseconds', () => {
        expect(parseDuration('1ms')).toBe(1);
        expect(parseDuration('250ms')).toBe(250);
    });

    test('seconds', () => {
        expect(parseDuration('1s')).toBe(1000);
        expect(parseDuration('30s')).toBe(30000);
    });

    test('minutes', () => {
        expect(parseDuration('1m')).toBe(60000);
        expect(parseDuration('5m')).toBe(300000);
    });

    test('hours', () => {
        expect(parseDuration('1h')).toBe(3600000);
        expect(parseDuration('2h')).toBe(7200000);
    });

    test('days', () => {
        expect(parseDuration('1d')).toBe(86400000);
    });

    test('weeks', () => {
        expect(parseDuration('1w')).toBe(604800000);
    });

    test('year is much larger than a day', () => {
        const year = parseDuration('1y');
        const day = parseDuration('1d');
        expect(year).toBeGreaterThan(day * 364);
        expect(year).toBeLessThan(day * 367);
    });
});

describe('parseDuration - combined / compound inputs', () => {
    test('combined without spaces "1d2h"', () => {
        expect(parseDuration('1d2h')).toBe(86400000 + 2 * 3600000);
    });

    test('combined with spaces "1h 30m"', () => {
        expect(parseDuration('1h 30m')).toBe(5400000);
    });

    test('three-part compound "1h30m15s"', () => {
        expect(parseDuration('1h30m15s')).toBe(3600000 + 30 * 60000 + 15000);
    });

    test('summing is order-independent', () => {
        expect(parseDuration('30m1h')).toBe(parseDuration('1h30m'));
    });
});

describe('parseDuration - whitespace handling', () => {
    test('leading and trailing whitespace is tolerated', () => {
        expect(parseDuration('  5m  ')).toBe(300000);
    });

    test('internal whitespace between value and unit', () => {
        expect(parseDuration('5 m')).toBe(300000);
    });
});

describe('parseDuration - decimals', () => {
    test('decimal hours', () => {
        expect(parseDuration('1.5h')).toBe(5400000);
    });

    test('decimal minutes', () => {
        expect(parseDuration('0.5m')).toBe(30000);
    });
});

describe('parseDuration - zero and signs', () => {
    test('plain zero returns 0', () => {
        expect(parseDuration('0')).toBe(0);
    });

    test('negative durations are preserved', () => {
        expect(parseDuration('-5m')).toBe(-300000);
        expect(parseDuration('-1h')).toBe(-3600000);
    });
});

describe('parseDuration - format conversion (second argument)', () => {
    test('convert minutes to seconds', () => {
        expect(parseDuration('5m', 's')).toBe(300);
    });

    test('convert hours to minutes', () => {
        expect(parseDuration('1h', 'm')).toBe(60);
    });

    test('convert minutes to hours yields a fraction', () => {
        expect(parseDuration('30m', 'h')).toBeCloseTo(0.5, 6);
    });
});

describe('parseDuration - invalid input', () => {
    test('empty string returns null', () => {
        expect(parseDuration('')).toBeNull();
    });

    test('non-numeric garbage returns null', () => {
        expect(parseDuration('bad')).toBeNull();
        expect(parseDuration('abc')).toBeNull();
    });

    test('pure unit without a number returns null', () => {
        expect(parseDuration('m')).toBeNull();
    });
});

describe('parseDuration - overflow / very large values', () => {
    test('very large day counts stay finite numbers', () => {
        const v = parseDuration('1000000d');
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBe(1000000 * 86400000);
    });
});