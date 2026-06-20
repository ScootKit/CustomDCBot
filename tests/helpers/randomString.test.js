const {randomString} = require('../../src/functions/helpers');

describe('randomString', () => {
    test('returns a string of the requested length', () => {
        expect(randomString(0)).toBe('');
        expect(randomString(1)).toHaveLength(1);
        expect(randomString(32)).toHaveLength(32);
        expect(randomString(200)).toHaveLength(200);
    });

    test('default charset only contains alphanumerics', () => {
        const out = randomString(1000);
        expect(out).toMatch(/^[A-Za-z0-9]+$/);
    });

    test('honors a custom charset', () => {
        const out = randomString(500, 'AB');
        expect(out).toMatch(/^[AB]+$/);
        // Both characters should appear in 500 draws with overwhelming probability.
        expect(out.includes('A')).toBe(true);
        expect(out.includes('B')).toBe(true);
    });

    test('single-character charset returns that character repeated', () => {
        expect(randomString(10, 'x')).toBe('xxxxxxxxxx');
    });

    test('produces different output on successive calls', () => {
        // 64 chars from 62-char alphabet collide with vanishing probability.
        const a = randomString(64);
        const b = randomString(64);
        expect(a).not.toBe(b);
    });
});
