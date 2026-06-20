const {
    dateToDiscordTimestamp,
    formatDate
} = require('../../src/functions/helpers');

describe('dateToDiscordTimestamp', () => {
    test('renders without style as bare <t:seconds>', () => {
        const d = new Date(1700000000_000);
        expect(dateToDiscordTimestamp(d)).toBe('<t:1700000000>');
    });

    test('appends a style suffix when provided', () => {
        const d = new Date(1700000000_000);
        expect(dateToDiscordTimestamp(d, 'R')).toBe('<t:1700000000:R>');
        expect(dateToDiscordTimestamp(d, 'F')).toBe('<t:1700000000:F>');
        expect(dateToDiscordTimestamp(d, 'f')).toBe('<t:1700000000:f>');
    });

    test('floors fractional seconds to integer (toFixed(0) rounds nearest)', () => {
        // 1500ms -> rounds to "2" via toFixed(0)
        expect(dateToDiscordTimestamp(new Date(1500))).toBe('<t:2>');
        // 1400ms -> rounds to "1"
        expect(dateToDiscordTimestamp(new Date(1400))).toBe('<t:1>');
    });

    test('handles epoch zero', () => {
        expect(dateToDiscordTimestamp(new Date(0))).toBe('<t:0>');
    });
});

describe('formatDate', () => {
    test('default mode returns two combined Discord timestamps', () => {
        const d = new Date(1700000000_000);
        expect(formatDate(d)).toBe('<t:1700000000> (<t:1700000000:R>)');
    });

    test('skipDiscordFormat mode delegates to the localize stub', () => {
        const d = new Date(Date.UTC(2024, 0, 5, 9, 7)); // 2024-01-05 09:07 UTC
        const out = formatDate(d, true);
        expect(out).toMatch(/^helpers\.timestamp\(/);
        // Args contain zero-padded dd, mm, hh, min and a yyyy.
        expect(out).toMatch(/yyyy=2024/);
        expect(out).toMatch(/mm=01/);
        expect(out).toMatch(/dd=05/);
    });
});