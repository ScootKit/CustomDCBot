// parse-duration v2 ships ESM-only. The wrapper resolves it via either
// require() (Node 22.12+ / jest) or dynamic import (older Node). Tests stub
// the upstream module and trigger init() before exercising the wrapper.

jest.mock('parse-duration', () => {
    const fn = (input) => {
        if (input === '5m') return 300000;
        if (input === '1h') return 3600000;
        if (input === '1h 30m') return 5400000;
        return null;
    };
    return {
        __esModule: true,
        default: fn
    };
});

const parseDuration = require('../../src/functions/parseDuration');

beforeAll(() => parseDuration.init());

describe('parseDuration wrapper', () => {
    test('exposes a callable function', () => {
        expect(typeof parseDuration).toBe('function');
    });

    test('forwards to the upstream default export', () => {
        expect(parseDuration('5m')).toBe(300000);
        expect(parseDuration('1h')).toBe(3600000);
        expect(parseDuration('1h 30m')).toBe(5400000);
    });

    test('returns null for unparseable input', () => {
        expect(parseDuration('bad')).toBeNull();
    });

    test('init() is idempotent (safe to call twice)', async () => {
        await expect(parseDuration.init()).resolves.toBeUndefined();
        expect(parseDuration('5m')).toBe(300000);
    });
});

describe('parseDuration wrapper - error before init', () => {
    test('throws a clear error when called before init() has resolved', async () => {
        await jest.isolateModulesAsync(async () => {
            const pd = require('../../src/functions/parseDuration');
            expect(() => pd('5m')).toThrow(/used before init/);
        });
    });
});