const {encryptField, decryptField, setEncryptionKey} = require('../../src/functions/secure-storage/fieldCrypto');

describe('fieldCrypto passthrough stub', () => {
    test('encryptField returns input unchanged', () => {
        expect(encryptField('hello')).toBe('hello');
        expect(encryptField(null)).toBeNull();
        expect(encryptField(undefined)).toBeUndefined();
        expect(encryptField(42)).toBe(42);
    });
    test('decryptField returns input unchanged', () => {
        expect(decryptField('hello')).toBe('hello');
        expect(decryptField(null)).toBeNull();
        expect(decryptField(undefined)).toBeUndefined();
    });
    test('setEncryptionKey is an inert no-op', () => {
        expect(() => setEncryptionKey('anything')).not.toThrow();
        expect(setEncryptionKey('anything')).toBeUndefined();
        expect(encryptField('x')).toBe('x');
    });
});
