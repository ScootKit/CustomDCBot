const {
    parseEmbedColor,
    inputReplacer,
    formatVoiceDuration,
    formatDurationShort
} = require('../../src/functions/helpers');

describe('parseEmbedColor', () => {
    test('resolves named colors to their numeric value', () => {
        expect(parseEmbedColor('RED')).toBe(0xE74C3C);
        expect(parseEmbedColor('BLURPLE')).toBe(0x5865F2);
    });

    test('returns numbers unchanged', () => {
        expect(parseEmbedColor(0xff00ff)).toBe(0xff00ff);
    });

    test('parses leading-hash hex strings', () => {
        expect(parseEmbedColor('#ff00ff')).toBe(0xff00ff);
        expect(parseEmbedColor('#000001')).toBe(1);
    });

    test('parses bare hex strings', () => {
        expect(parseEmbedColor('abcdef')).toBe(0xabcdef);
    });

    test('passes through non-string non-number values', () => {
        expect(parseEmbedColor(null)).toBeNull();
        expect(parseEmbedColor(undefined)).toBeUndefined();
    });
});

describe('inputReplacer', () => {
    test('substitutes every key in the args map', () => {
        expect(inputReplacer({
            '%name%': 'Alice',
            '%score%': 42
        }, 'hi %name%, you scored %score%')).toBe('hi Alice, you scored 42');
    });

    test('replaces all occurrences, not just the first', () => {
        expect(inputReplacer({'%x%': '1'}, '%x%-%x%-%x%')).toBe('1-1-1');
    });

    test('coerces non-string non-number arg values to empty string', () => {
        expect(inputReplacer({'%foo%': null}, '[%foo%]')).toBe('[]');
        expect(inputReplacer({'%foo%': {a: 1}}, '[%foo%]')).toBe('[]');
    });

    test('returns input unchanged when args is not an object', () => {
        expect(inputReplacer('not an object', 'hello %name%')).toBe('hello %name%');
    });

    test('returns null in returnNull mode for empty input', () => {
        expect(inputReplacer({}, '', true)).toBeNull();
        expect(inputReplacer({}, null, true)).toBeNull();
    });

    test('coerces missing input to empty string by default', () => {
        expect(inputReplacer({'%a%': 'X'}, null)).toBe('');
    });
});

describe('formatVoiceDuration', () => {
    test('zero or negative becomes "0m"', () => {
        expect(formatVoiceDuration(0)).toBe('helpers.voice-time-m(i=0)');
        expect(formatVoiceDuration(-5)).toBe('helpers.voice-time-m(i=0)');
        expect(formatVoiceDuration(Infinity)).toBe('helpers.voice-time-m(i=0)');
    });

    test('seconds below a minute use the s key', () => {
        expect(formatVoiceDuration(30)).toBe('helpers.voice-time-s(i=30)');
    });

    test('minutes below an hour use the m key', () => {
        expect(formatVoiceDuration(125)).toBe('helpers.voice-time-m(i=2)');
        expect(formatVoiceDuration(60)).toBe('helpers.voice-time-m(i=1)');
    });

    test('an hour or more uses the hm key', () => {
        expect(formatVoiceDuration(6125)).toBe('helpers.voice-time-hm(h=1,m=42)');
        expect(formatVoiceDuration(3600)).toBe('helpers.voice-time-hm(h=1,m=0)');
    });
});

describe('formatDurationShort', () => {
    test('sub-minute values return the just-now key', () => {
        expect(formatDurationShort(0)).toBe('helpers.duration-just-now');
        expect(formatDurationShort(59_000)).toBe('helpers.duration-just-now');
        expect(formatDurationShort(NaN)).toBe('helpers.duration-just-now');
    });

    test('uses singular keys when the value is 1', () => {
        expect(formatDurationShort(60_000)).toBe('helpers.duration-minute(i=1)');
        expect(formatDurationShort(60 * 60_000)).toBe('helpers.duration-hour(i=1)');
        expect(formatDurationShort(24 * 60 * 60_000)).toBe('helpers.duration-day(i=1)');
    });

    test('uses plural keys for >1', () => {
        expect(formatDurationShort(5 * 60_000)).toBe('helpers.duration-minutes(i=5)');
        expect(formatDurationShort(3 * 60 * 60_000)).toBe('helpers.duration-hours(i=3)');
    });

    test('picks the largest meaningful unit', () => {
        const tenDays = 10 * 24 * 60 * 60_000;
        expect(formatDurationShort(tenDays)).toBe('helpers.duration-days(i=10)');
        const twoMonths = 60 * 24 * 60 * 60_000;
        expect(formatDurationShort(twoMonths)).toBe('helpers.duration-months(i=2)');
    });
});