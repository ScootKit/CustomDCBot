/*
 * Unit tests for the PrivateBin paste building blocks exposed via helpers.__test:
 * base58Encode, encryptPrivatebinPaste, classifyHttpStatus, parseRetryAfterMs,
 * computePasteRetryDelayMs and classifyPrivatebinResponse. These are pure-ish
 * (some use crypto/Math.random) and are not otherwise covered by existing suites.
 */
const helpers = require('../../src/functions/helpers');
const {__test} = helpers;
const {
    base58Encode,
    encryptPrivatebinPaste,
    classifyHttpStatus,
    parseRetryAfterMs,
    computePasteRetryDelayMs,
    classifyPrivatebinResponse
} = __test;

afterEach(() => jest.restoreAllMocks());

describe('base58Encode', () => {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    test('empty buffer returns empty string', () => {
        expect(base58Encode(Buffer.from([]))).toBe('');
    });

    test('single zero byte encodes to "1"', () => {
        expect(base58Encode(Buffer.from([0]))).toBe('1');
    });

    test('leading zero bytes become leading "1"s', () => {
        expect(base58Encode(Buffer.from([0, 0, 0]))).toBe('111');
    });

    test('value 57 maps to the last alphabet char', () => {
        expect(base58Encode(Buffer.from([57]))).toBe(ALPHABET[57]);
    });

    test('value 58 rolls over to "21"', () => {
        // 58 = 1*58 + 0 -> digits [1,0] -> alphabet[1] + alphabet[0] = '2' + '1'
        expect(base58Encode(Buffer.from([58]))).toBe('21');
    });

    test('known multi-byte vector (the string "Hello World!")', () => {
        // Canonical base58 of ASCII "Hello World!"
        expect(base58Encode(Buffer.from('Hello World!', 'utf8'))).toBe('2NEpo7TZRRrLZSi2U');
    });

    test('leading zeros are preserved alongside encoded payload', () => {
        const out = base58Encode(Buffer.from([0, 0, 1]));
        expect(out.startsWith('11')).toBe(true);
        expect(out).toBe('112');
    });

    test('output only contains base58 alphabet characters', () => {
        const out = base58Encode(Buffer.from([255, 254, 253, 1, 2, 3, 99]));
        for (const ch of out) expect(ALPHABET.includes(ch)).toBe(true);
    });

    test('is deterministic for the same input', () => {
        const buf = Buffer.from([12, 34, 56, 78, 90]);
        expect(base58Encode(buf)).toBe(base58Encode(buf));
    });
});

describe('encryptPrivatebinPaste', () => {
    const crypto = require('crypto');

    test('returns base64 ciphertext and a well-formed adata tuple', () => {
        const key = crypto.randomBytes(32);
        const {
            ct,
            adata
        } = encryptPrivatebinPaste('secret', key, {});
        expect(typeof ct).toBe('string');
        // base64 of (ciphertext + 16-byte GCM tag) is non-empty
        expect(ct.length).toBeGreaterThan(0);
        expect(Buffer.from(ct, 'base64').length).toBeGreaterThanOrEqual(16);
        // adata: [[iv, salt, iterations, 256, tagbits, 'aes', 'gcm', compression], format, opendiscussion, burn]
        expect(Array.isArray(adata)).toBe(true);
        expect(adata).toHaveLength(4);
        const spec = adata[0];
        expect(spec[2]).toBe(100000); // PBKDF2 iterations
        expect(spec[3]).toBe(256);
        expect(spec[4]).toBe(128); // GCM tag bits
        expect(spec[5]).toBe('aes');
        expect(spec[6]).toBe('gcm');
        expect(spec[7]).toBe('zlib'); // default compression
    });

    test('defaults textformat to plaintext and flags to 0', () => {
        const {adata} = encryptPrivatebinPaste('x', crypto.randomBytes(32), {});
        expect(adata[1]).toBe('plaintext');
        expect(adata[2]).toBe(0); // opendiscussion
        expect(adata[3]).toBe(0); // burnafterreading
    });

    test('honors opendiscussion and burnafterreading truthy options as 1', () => {
        const {adata} = encryptPrivatebinPaste('x', crypto.randomBytes(32), {
            opendiscussion: true,
            burnafterreading: true,
            textformat: 'markdown'
        });
        expect(adata[1]).toBe('markdown');
        expect(adata[2]).toBe(1);
        expect(adata[3]).toBe(1);
    });

    test('honors a custom compression value in the spec', () => {
        const {adata} = encryptPrivatebinPaste('x', crypto.randomBytes(32), {compression: 'none'});
        expect(adata[0][7]).toBe('none');
    });

    test('iv and salt are valid base64 of expected byte lengths', () => {
        const {adata} = encryptPrivatebinPaste('x', crypto.randomBytes(32), {});
        expect(Buffer.from(adata[0][0], 'base64')).toHaveLength(16); // iv
        expect(Buffer.from(adata[0][1], 'base64')).toHaveLength(8);  // salt
    });

    test('produces different ciphertext across calls (random iv/salt)', () => {
        const key = crypto.randomBytes(32);
        const a = encryptPrivatebinPaste('same', key, {});
        const b = encryptPrivatebinPaste('same', key, {});
        expect(a.ct).not.toBe(b.ct);
    });

    test('round-trips: zlib-decompressed plaintext decrypts back to the paste', () => {
        const zlib = require('zlib');
        const masterKey = crypto.randomBytes(32);
        // Reconstruct decryption using the emitted adata.
        const {
            ct,
            adata
        } = encryptPrivatebinPaste('round-trip-me', masterKey, {});
        const spec = adata[0];
        const iv = Buffer.from(spec[0], 'base64');
        const salt = Buffer.from(spec[1], 'base64');
        const derivedKey = crypto.pbkdf2Sync(masterKey, salt, spec[2], 32, 'sha256');
        const raw = Buffer.from(ct, 'base64');
        const tag = raw.subarray(raw.length - 16);
        const body = raw.subarray(0, raw.length - 16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv, {authTagLength: 16});
        decipher.setAAD(Buffer.from(JSON.stringify(adata), 'utf8'));
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
        const json = JSON.parse(zlib.inflateRawSync(decrypted).toString('utf8'));
        expect(json.paste).toBe('round-trip-me');
    });
});

describe('parseRetryAfterMs', () => {
    test('returns null for missing headers', () => {
        expect(parseRetryAfterMs(null)).toBeNull();
        expect(parseRetryAfterMs({})).toBeNull();
        expect(parseRetryAfterMs(undefined)).toBeNull();
    });

    test('parses lowercase retry-after into milliseconds', () => {
        expect(parseRetryAfterMs({'retry-after': '5'})).toBe(5000);
    });

    test('parses capitalized Retry-After header', () => {
        expect(parseRetryAfterMs({'Retry-After': '3'})).toBe(3000);
    });

    test('returns null for non-positive or non-numeric values', () => {
        expect(parseRetryAfterMs({'retry-after': '0'})).toBeNull();
        expect(parseRetryAfterMs({'retry-after': '-2'})).toBeNull();
        expect(parseRetryAfterMs({'retry-after': 'soon'})).toBeNull();
    });

    test('caps very large values at PASTE_RETRY_MAX_DELAY_MS (60000)', () => {
        expect(parseRetryAfterMs({'retry-after': '9999'})).toBe(60000);
    });

    test('parses numeric prefix via parseInt (e.g. "10s" -> 10000)', () => {
        expect(parseRetryAfterMs({'retry-after': '10s'})).toBe(10000);
    });
});

describe('classifyHttpStatus', () => {
    test('no status (network error) is retryable', () => {
        expect(classifyHttpStatus(null, {})).toEqual({
            retryable: true,
            retryAfterMs: null
        });
    });

    test('429 is retryable', () => {
        expect(classifyHttpStatus(429, {}).retryable).toBe(true);
    });

    test('408 and 425 are retryable', () => {
        expect(classifyHttpStatus(408, {}).retryable).toBe(true);
        expect(classifyHttpStatus(425, {}).retryable).toBe(true);
    });

    test('5xx range is retryable, 600+ is not', () => {
        expect(classifyHttpStatus(500, {}).retryable).toBe(true);
        expect(classifyHttpStatus(599, {}).retryable).toBe(true);
        expect(classifyHttpStatus(600, {}).retryable).toBe(false);
    });

    test('4xx (non 408/425/429) is not retryable', () => {
        expect(classifyHttpStatus(400, {}).retryable).toBe(false);
        expect(classifyHttpStatus(403, {}).retryable).toBe(false);
        expect(classifyHttpStatus(413, {}).retryable).toBe(false);
    });

    test('2xx/3xx are not retryable', () => {
        expect(classifyHttpStatus(200, {}).retryable).toBe(false);
        expect(classifyHttpStatus(301, {}).retryable).toBe(false);
    });

    test('passes through parsed retryAfterMs from headers', () => {
        expect(classifyHttpStatus(429, {'retry-after': '7'}).retryAfterMs).toBe(7000);
    });

    test('includes the status field when status provided', () => {
        expect(classifyHttpStatus(503, {}).status).toBe(503);
    });
});

describe('classifyPrivatebinResponse', () => {
    test('ok when a non-empty url is present', () => {
        expect(classifyPrivatebinResponse({url: '/?abc'})).toEqual({ok: true});
    });

    test('not ok with default message when url missing', () => {
        const r = classifyPrivatebinResponse({});
        expect(r.ok).toBe(false);
        expect(r.message).toBe('PrivateBin response missing url');
    });

    test('empty-string url is treated as missing', () => {
        const r = classifyPrivatebinResponse({url: ''});
        expect(r.ok).toBe(false);
    });

    test('prefers message over error field', () => {
        const r = classifyPrivatebinResponse({
            message: 'boom',
            error: 'other'
        });
        expect(r.message).toBe('boom');
    });

    test('size/large/invalid messages are non-retryable permanent failures', () => {
        expect(classifyPrivatebinResponse({message: 'Paste size exceeded'}).retryable).toBe(false);
        expect(classifyPrivatebinResponse({message: 'Document too large'}).retryable).toBe(false);
        expect(classifyPrivatebinResponse({message: 'Invalid data'}).retryable).toBe(false);
    });

    test('flood/wait/try again/busy messages are retryable', () => {
        expect(classifyPrivatebinResponse({message: 'Flood protection'}).retryable).toBe(true);
        expect(classifyPrivatebinResponse({message: 'Please wait'}).retryable).toBe(true);
        expect(classifyPrivatebinResponse({message: 'try again later'}).retryable).toBe(true);
        expect(classifyPrivatebinResponse({message: 'server busy'}).retryable).toBe(true);
    });

    test('unknown error messages default to non-retryable', () => {
        expect(classifyPrivatebinResponse({error: 'mystery'}).retryable).toBe(false);
    });

    test('handles null response', () => {
        const r = classifyPrivatebinResponse(null);
        expect(r.ok).toBe(false);
        expect(r.message).toBe('PrivateBin response missing url');
    });
});

describe('computePasteRetryDelayMs', () => {
    test('returns the provided retryAfterMs verbatim when set', () => {
        expect(computePasteRetryDelayMs(0, 4321)).toBe(4321);
        expect(computePasteRetryDelayMs(5, 100)).toBe(100);
    });

    test('exponential backoff with zero jitter at attempt 0', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        // base = 1000 * 2^0 = 1000, jitter 0
        expect(computePasteRetryDelayMs(0, null)).toBe(1000);
    });

    test('backoff doubles with attempt index', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        expect(computePasteRetryDelayMs(1, null)).toBe(2000);
        expect(computePasteRetryDelayMs(2, null)).toBe(4000);
        expect(computePasteRetryDelayMs(3, null)).toBe(8000);
    });

    test('jitter is added on top of the base (0..499)', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.998); // floor(0.998*500)=499
        expect(computePasteRetryDelayMs(0, null)).toBe(1499);
    });

    test('clamps to the 60000ms ceiling for large attempts', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        // attempt 10 -> base 1000*1024 = 1024000, clamped to 60000
        expect(computePasteRetryDelayMs(10, null)).toBe(60000);
    });
});