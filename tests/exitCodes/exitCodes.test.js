/*
 * Tests for src/functions/exitCodes.js:
 *   - classifyLoginError taxonomy
 *   - loginErrorExitCode / disconnectExitCode mapping (64/65/1)
 *   - the start-time opt-in gate: pick(newCode, legacyCode) returns the new-convention code only
 *     when --scnx-exit-codes / SCNX_EXIT_CODES=1 is present, else the legacy code (default 0).
 * Environment toggling is deterministic: saved before and restored after every test.
 */

const {EXIT, classifyLoginError, loginErrorExitCode, LOGIN_EXIT, exitCodesEnabled, pick, disconnectExitCode, DISCONNECT_EXIT} = require('../../src/functions/exitCodes');

let prevScnxExitCodesEnv;
beforeEach(() => {
    prevScnxExitCodesEnv = process.env.SCNX_EXIT_CODES;
    delete process.env.SCNX_EXIT_CODES;
});
afterEach(() => {
    if (typeof prevScnxExitCodesEnv === 'undefined') delete process.env.SCNX_EXIT_CODES;
    else process.env.SCNX_EXIT_CODES = prevScnxExitCodesEnv;
});

describe('classifyLoginError - taxonomy', () => {
    test('MissingToken when the token was absent (short-circuits before inspecting the error)', () => {
        expect(classifyLoginError(new Error('anything'), true)).toBe('MissingToken');
        expect(classifyLoginError(null, true)).toBe('MissingToken');
    });

    test('InvalidToken via discord.js error code', () => {
        expect(classifyLoginError({code: 'TokenInvalid'}, false)).toBe('InvalidToken');
    });

    test('InvalidToken via message text', () => {
        expect(classifyLoginError(new Error('An invalid token was provided'), false)).toBe('InvalidToken');
        expect(classifyLoginError(new Error('invalid token'), false)).toBe('InvalidToken');
    });

    test('DisallowedIntents via message text', () => {
        expect(classifyLoginError(new Error('Privileged message content intent is disallowed intent'), false)).toBe('DisallowedIntents');
    });

    test('DisallowedIntents takes priority over an invalid-token substring', () => {
        // "disallowed intent" is checked before the token check.
        expect(classifyLoginError(new Error('disallowed intent (invalid token)'), false)).toBe('DisallowedIntents');
    });

    test('Network via connection error codes', () => {
        for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']) {
            expect(classifyLoginError({code}, false)).toBe('Network');
        }
    });

    test('Network via message text', () => {
        expect(classifyLoginError(new Error('getaddrinfo failed'), false)).toBe('Network');
        expect(classifyLoginError(new Error('fetch failed'), false)).toBe('Network');
    });

    test('RateLimited via message text', () => {
        expect(classifyLoginError(new Error('You are being rate limited'), false)).toBe('RateLimited');
        expect(classifyLoginError(new Error('429 Too Many Requests'), false)).toBe('RateLimited');
    });

    test('Unknown for anything unrecognized', () => {
        expect(classifyLoginError(new Error('some other failure'), false)).toBe('Unknown');
        expect(classifyLoginError(null, false)).toBe('Unknown');
    });
});

describe('loginErrorExitCode - mapping to systemd exit codes', () => {
    test.each([
        ['MissingToken', 64],
        ['InvalidToken', 64],
        ['DisallowedIntents', 65],
        ['Network', 1],
        ['RateLimited', 1],
        ['Unknown', 1]
    ])('%s -> %i', (kind, code) => {
        expect(loginErrorExitCode(kind)).toBe(code);
        expect(LOGIN_EXIT[kind]).toBe(code);
    });

    test('defaults to 1 (transient) for an unrecognized class', () => {
        expect(loginErrorExitCode('SomethingNew')).toBe(1);
    });

    test('EXIT constants carry the documented values', () => {
        expect(EXIT).toEqual({
            CLEAN_STOP: 0,
            CRASH_TRANSIENT: 1,
            FATAL_INVALID_TOKEN: 64,
            FATAL_INTENTS: 65,
            FATAL_REMOVED: 66,
            FATAL_CONFIG: 78
        });
    });
});

describe('disconnectExitCode - runtime gateway disconnect close-code mapping', () => {
    test.each([
        [4004, 64], // AuthenticationFailed -> invalid token
        [4013, 65], // InvalidIntents
        [4014, 65] // DisallowedIntents
    ])('unrecoverable close code %i -> exit %i', (closeCode, exit) => {
        expect(disconnectExitCode(closeCode)).toBe(exit);
        expect(DISCONNECT_EXIT[closeCode]).toBe(exit);
    });

    test('other unrecoverable codes (invalid shard / sharding required / invalid api version) -> transient 1', () => {
        for (const closeCode of [4010, 4011, 4012]) {
            expect(disconnectExitCode(closeCode)).toBe(EXIT.CRASH_TRANSIENT);
        }
    });

    test('unknown / missing close codes default to transient 1', () => {
        expect(disconnectExitCode(1006)).toBe(EXIT.CRASH_TRANSIENT);
        expect(disconnectExitCode('unknown')).toBe(EXIT.CRASH_TRANSIENT);
        expect(disconnectExitCode()).toBe(EXIT.CRASH_TRANSIENT); // no code passed
    });

    test('end-to-end through the gate: token/intents fatals gate to legacy 0, transient stays 1', () => {

        /*
         * A runtime disconnect never exited before, so the transient case passes legacyCode 1 (safe
         * under both old PM2 and the new supervisor) while fatals fall back to 0 to avoid a restart loop.
         */
        function legacyFor(newCode) {
            return newCode === EXIT.CRASH_TRANSIENT ? EXIT.CRASH_TRANSIENT : 0;
        }
        // flag OFF
        expect(pick(disconnectExitCode(4004), legacyFor(disconnectExitCode(4004)))).toBe(0);
        expect(pick(disconnectExitCode(4014), legacyFor(disconnectExitCode(4014)))).toBe(0);
        expect(pick(disconnectExitCode(1006), legacyFor(disconnectExitCode(1006)))).toBe(1);
        // flag ON
        process.env.SCNX_EXIT_CODES = '1';
        expect(pick(disconnectExitCode(4004), legacyFor(disconnectExitCode(4004)))).toBe(64);
        expect(pick(disconnectExitCode(4013), legacyFor(disconnectExitCode(4013)))).toBe(65);
        expect(pick(disconnectExitCode(1006), legacyFor(disconnectExitCode(1006)))).toBe(1);
    });
});

describe('opt-in gate (exitCodesEnabled / pick)', () => {
    test('disabled by default: pick returns the legacy code (default 0)', () => {
        expect(exitCodesEnabled()).toBe(false);
        expect(pick(66)).toBe(0);
        expect(pick(78)).toBe(0);
        expect(pick(64)).toBe(0);
        expect(pick(1)).toBe(0);
    });

    test('disabled: an explicit legacyCode is honoured (pre-convention exit-1 sites stay 1)', () => {
        expect(pick(1, 1)).toBe(1);
    });

    test('SCNX_EXIT_CODES=1 enables the new codes (lazily, at call time)', () => {
        expect(pick(66)).toBe(0); // before the toggle
        process.env.SCNX_EXIT_CODES = '1';
        expect(exitCodesEnabled()).toBe(true);
        expect(pick(66)).toBe(66);
        expect(pick(78)).toBe(78);
        expect(pick(1, 1)).toBe(1);
    });

    test('SCNX_EXIT_CODES with any other value does not enable', () => {
        process.env.SCNX_EXIT_CODES = 'true';
        expect(exitCodesEnabled()).toBe(false);
        expect(pick(66)).toBe(0);
    });

    test('--scnx-exit-codes argv flag enables the new codes', () => {
        process.argv.push('--scnx-exit-codes');
        try {
            expect(exitCodesEnabled()).toBe(true);
            expect(pick(65)).toBe(65);
        } finally {
            process.argv.pop();
        }
    });

    test('end-to-end, both modes: login classifier through the gate', () => {
        const kind = classifyLoginError({code: 'TokenInvalid'}, false);
        expect(pick(loginErrorExitCode(kind))).toBe(0); // flag off -> legacy 0
        process.env.SCNX_EXIT_CODES = '1';
        expect(pick(loginErrorExitCode(kind))).toBe(64); // flag on -> new code
        expect(pick(loginErrorExitCode(classifyLoginError({code: 'ETIMEDOUT'}, false)))).toBe(1);
        expect(pick(loginErrorExitCode(classifyLoginError(new Error('disallowed intent'), false)))).toBe(65);
    });
});
