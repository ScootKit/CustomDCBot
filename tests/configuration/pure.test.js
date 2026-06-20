// Tests for the pure / fs-backed helpers of configuration.js:
//   - isLocalizedObject: shape detector for the legacy {en, de, ...} format
//   - loadConfigLocalization: reads + caches a locale JSON file from disk
//
// fs is mocked so loadConfigLocalization is exercised without touching the
// real config-localizations directory, and so caching + error fallback can be
// asserted by counting reads.

jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));

const fs = require('fs');
const {
    isLocalizedObject,
    loadConfigLocalization
} = require('../../src/functions/configuration');

describe('isLocalizedObject', () => {
    test('true for an object with en and 2-3 letter locale keys', () => {
        expect(isLocalizedObject({
            en: 'Hello',
            de: 'Hallo'
        })).toBe(true);
        expect(isLocalizedObject({
            en: 'x',
            por: 'y'
        })).toBe(true);
    });

    test('false when "en" key is absent', () => {
        expect(isLocalizedObject({de: 'Hallo'})).toBe(false);
    });

    test('false when a key is not a 2-3 letter code', () => {
        expect(isLocalizedObject({
            en: 'x',
            english: 'y'
        })).toBe(false);
        expect(isLocalizedObject({
            en: 'x',
            e: 'y'
        })).toBe(false);
        expect(isLocalizedObject({
            en: 'x',
            EN: 'y'
        })).toBe(false);
    });

    test('false for arrays', () => {
        expect(isLocalizedObject(['en'])).toBe(false);
    });

    test('false for null and undefined', () => {
        expect(isLocalizedObject(null)).toBe(false);
        expect(isLocalizedObject(undefined)).toBe(false);
    });

    test('false for primitives', () => {
        expect(isLocalizedObject('en')).toBe(false);
        expect(isLocalizedObject(42)).toBe(false);
        expect(isLocalizedObject(true)).toBe(false);
    });

    test('true for an object that is only {en: ...}', () => {
        expect(isLocalizedObject({en: 'only'})).toBe(true);
    });
});

describe('loadConfigLocalization', () => {
    beforeEach(() => {
        fs.readFileSync.mockReset();
    });

    test('parses and returns the JSON content for a locale', () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({_core: {greeting: 'hi'}}));
        const result = loadConfigLocalization('fr');
        expect(result).toEqual({_core: {greeting: 'hi'}});
        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    test('caches per-locale (no second disk read)', () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({a: 1}));
        loadConfigLocalization('it');
        loadConfigLocalization('it');
        // first call read once; second served from cache
        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    test('returns empty object and caches on read error', () => {
        fs.readFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const result = loadConfigLocalization('xx');
        expect(result).toEqual({});
        // cached empty: a repeat does not retry the failed read
        loadConfigLocalization('xx');
        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    test('reads from the config-localizations directory using the locale', () => {
        fs.readFileSync.mockReturnValue('{}');
        loadConfigLocalization('es');
        const calledPath = fs.readFileSync.mock.calls[0][0];
        expect(calledPath).toContain('config-localizations');
        expect(calledPath).toContain('es.json');
    });
});