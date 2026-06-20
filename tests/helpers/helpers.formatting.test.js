/*
 * Edge-case coverage for the locale/duration/date formatting helpers:
 * formatNumber (locale + Intl options + non-numeric), formatVoiceDuration and
 * formatDurationShort boundary transitions, dateToDiscordTimestamp rounding,
 * and formatDate skipDiscordFormat zero-padding. Complements dateFormatting and
 * pureHelpers which cover the happy paths.
 */
const mainStub = require('../__stubs__/main');
const helpers = require('../../src/functions/helpers');
const {
    formatNumber,
    formatVoiceDuration,
    formatDurationShort,
    dateToDiscordTimestamp,
    formatDate
} = helpers;

beforeEach(() => {
    mainStub.client.bcp47Locale = 'en-US';
    mainStub.client.config = {
        disableEveryoneProtection: false,
        timezone: 'UTC'
    };
    mainStub.client.strings = {
        footer: 'f',
        footerImgUrl: '',
        disableFooterTimestamp: false
    };
});

describe('formatNumber (edge cases)', () => {
    test('formats with German locale grouping/decimal separators', () => {
        mainStub.client.bcp47Locale = 'de-DE';
        expect(formatNumber(1234567.89)).toBe('1.234.567,89');
    });

    test('formats zero', () => {
        expect(formatNumber(0)).toBe('0');
    });

    test('formats negative numbers', () => {
        expect(formatNumber(-2500)).toBe('-2,500');
    });

    test('non-numeric string parses to NaN and Intl renders "NaN"', () => {
        expect(formatNumber('not-a-number')).toBe('NaN');
    });

    test('currency style option is honored', () => {
        expect(formatNumber(5, {
            style: 'currency',
            currency: 'USD'
        })).toBe('$5.00');
    });

    test('maximumFractionDigits option rounds the value', () => {
        expect(formatNumber(3.14159, {maximumFractionDigits: 2})).toBe('3.14');
    });

    test('parses an integer-looking string', () => {
        expect(formatNumber('1000000')).toBe('1,000,000');
    });
});

describe('formatVoiceDuration (boundaries)', () => {
    test('NaN/negative/zero all map to 0 minutes', () => {
        expect(formatVoiceDuration(NaN)).toBe('helpers.voice-time-m(i=0)');
        expect(formatVoiceDuration(-1)).toBe('helpers.voice-time-m(i=0)');
        expect(formatVoiceDuration(0)).toBe('helpers.voice-time-m(i=0)');
    });

    test('1 second renders the seconds key', () => {
        expect(formatVoiceDuration(1)).toBe('helpers.voice-time-s(i=1)');
    });

    test('59 seconds is still the seconds key', () => {
        expect(formatVoiceDuration(59)).toBe('helpers.voice-time-s(i=59)');
    });

    test('exactly 60 crosses to the minutes key', () => {
        expect(formatVoiceDuration(60)).toBe('helpers.voice-time-m(i=1)');
    });

    test('3599 seconds is still minutes (59m)', () => {
        expect(formatVoiceDuration(3599)).toBe('helpers.voice-time-m(i=59)');
    });

    test('exactly 3600 crosses to hours+minutes (1h 0m)', () => {
        expect(formatVoiceDuration(3600)).toBe('helpers.voice-time-hm(h=1,m=0)');
    });

    test('fractional seconds are floored', () => {
        expect(formatVoiceDuration(90.9)).toBe('helpers.voice-time-m(i=1)');
    });

    test('large multi-hour duration', () => {
        // 7325s = 2h 2m 5s -> 2h 2m
        expect(formatVoiceDuration(7325)).toBe('helpers.voice-time-hm(h=2,m=2)');
    });
});

describe('formatDurationShort (boundaries)', () => {
    test('Infinity and -Infinity fall to just-now (not finite)', () => {
        expect(formatDurationShort(Infinity)).toBe('helpers.duration-just-now');
        expect(formatDurationShort(-Infinity)).toBe('helpers.duration-just-now');
    });

    test('exactly 60_000 is one minute (boundary of just-now)', () => {
        expect(formatDurationShort(60_000)).toBe('helpers.duration-minute(i=1)');
    });

    test('one year exactly uses the singular year key', () => {
        const year = 365 * 24 * 60 * 60 * 1000;
        expect(formatDurationShort(year)).toBe('helpers.duration-year(i=1)');
    });

    test('two years uses plural', () => {
        const year = 365 * 24 * 60 * 60 * 1000;
        expect(formatDurationShort(2 * year)).toBe('helpers.duration-years(i=2)');
    });

    test('one month boundary picks month, not 30 days', () => {
        const month = 30 * 24 * 60 * 60 * 1000;
        expect(formatDurationShort(month)).toBe('helpers.duration-month(i=1)');
    });

    test('23 hours stays in hours', () => {
        expect(formatDurationShort(23 * 60 * 60 * 1000)).toBe('helpers.duration-hours(i=23)');
    });

    test('29 days stays in days (just under a month)', () => {
        expect(formatDurationShort(29 * 24 * 60 * 60 * 1000)).toBe('helpers.duration-days(i=29)');
    });
});

describe('dateToDiscordTimestamp (rounding)', () => {
    test('rounds 1999ms up to 2 seconds (toFixed(0) is round-half)', () => {
        expect(dateToDiscordTimestamp(new Date(1999))).toBe('<t:2>');
    });

    test('500ms rounds to 1 (round-half-to-even / nearest)', () => {
        expect(dateToDiscordTimestamp(new Date(500))).toBe('<t:1>');
    });

    test('all documented style suffixes pass through', () => {
        const d = new Date(1700000000_000);
        for (const style of ['t', 'T', 'd', 'D', 'f', 'F', 'R']) {
            expect(dateToDiscordTimestamp(d, style)).toBe(`<t:1700000000:${style}>`);
        }
    });
});

describe('formatDate skipDiscordFormat (zero padding)', () => {
    test('single-digit day/month/hour/minute are zero-padded', () => {
        const d = new Date(2024, 2, 7, 8, 5); // March 7 08:05 (local)
        const out = formatDate(d, true);
        expect(out).toMatch(/dd=07/);
        expect(out).toMatch(/mm=03/);
        expect(out).toMatch(/hh=08/);
        expect(out).toMatch(/min=05/);
        expect(out).toMatch(/yyyy=2024/);
    });

    test('double-digit values are not padded', () => {
        const d = new Date(2024, 10, 25, 14, 30); // Nov 25 14:30
        const out = formatDate(d, true);
        expect(out).toMatch(/dd=25/);
        expect(out).toMatch(/mm=11/);
        expect(out).toMatch(/hh=14/);
        expect(out).toMatch(/min=30/);
    });
});