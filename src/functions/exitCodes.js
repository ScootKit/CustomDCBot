/*
 * Exit codes a supervisor reads to decide whether to restart: 0 = intentional stop, 1 = transient,
 * 6x/78 = user-actionable fatals that must never be restarted. When in doubt, exit 1. Opt-in via
 * exitCodesEnabled(), so the historical "always 0" behaviour is kept until a supervisor opts in.
 */
const EXIT = {
    CLEAN_STOP: 0,
    CRASH_TRANSIENT: 1, // retryable: network, 5xx, timeout, unknown crash
    FATAL_INVALID_TOKEN: 64,
    FATAL_INTENTS: 65,
    FATAL_REMOVED: 66, // bot removed from its guild (confirmed, not a transient fetch failure)
    FATAL_CONFIG: 78
};

/**
 * Classify a Discord login failure.
 * @param {Error} e Error thrown by client.login
 * @param {boolean} tokenMissing True when no token was configured at all
 * @returns {string} MissingToken | InvalidToken | DisallowedIntents | Network | RateLimited | Unknown
 */
function classifyLoginError(e, tokenMissing) {
    if (tokenMissing) return 'MissingToken';
    const code = e && e.code ? String(e.code) : '';
    const name = e && e.name ? String(e.name) : '';
    const msg = e && e.message ? String(e.message) : '';
    const haystack = `${code} ${name} ${msg}`.toLowerCase();
    if (haystack.includes('disallowed intent')) return 'DisallowedIntents';
    if (code === 'TokenInvalid' || haystack.includes('invalid token') || haystack.includes('an invalid token was provided')) return 'InvalidToken';
    if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)) return 'Network';
    if (haystack.includes('getaddrinfo') || haystack.includes('network') || haystack.includes('fetch failed')) return 'Network';
    if (haystack.includes('rate limit') || haystack.includes('ratelimit') || haystack.includes('429')) return 'RateLimited';
    return 'Unknown';
}

const LOGIN_EXIT = {
    MissingToken: EXIT.FATAL_INVALID_TOKEN,
    InvalidToken: EXIT.FATAL_INVALID_TOKEN,
    DisallowedIntents: EXIT.FATAL_INTENTS,
    Network: EXIT.CRASH_TRANSIENT,
    RateLimited: EXIT.CRASH_TRANSIENT,
    Unknown: EXIT.CRASH_TRANSIENT
};

/**
 * Exit code for a classifyLoginError class. An unrecognised class is transient, never fatal.
 * @param {string} kind
 * @returns {number}
 */
function loginErrorExitCode(kind) {
    return Object.prototype.hasOwnProperty.call(LOGIN_EXIT, kind) ? LOGIN_EXIT[kind] : EXIT.CRASH_TRANSIENT;
}

// Only the six UNRECOVERABLE close codes reach here; 4010/4011/4012 can't occur single-sharded.
const DISCONNECT_EXIT = {
    4004: EXIT.FATAL_INVALID_TOKEN,
    4013: EXIT.FATAL_INTENTS,
    4014: EXIT.FATAL_INTENTS
};

/**
 * Exit code for a runtime gateway close code. Anything unmapped is transient.
 * @param {number|string} code
 * @returns {number}
 */
function disconnectExitCode(code) {
    return Object.prototype.hasOwnProperty.call(DISCONNECT_EXIT, code) ? DISCONNECT_EXIT[code] : EXIT.CRASH_TRANSIENT;
}

/**
 * Whether the new exit-code convention is active. Evaluated lazily so it can be toggled in tests.
 * @returns {boolean}
 */
function exitCodesEnabled() {
    return process.argv.includes('--scnx-exit-codes') || process.env.SCNX_EXIT_CODES === '1';
}

/**
 * New-convention code when the opt-in is present, legacy code otherwise.
 * @param {number} newCode
 * @param {number} [legacyCode=0] What this site exited before the convention existed
 * @returns {number}
 */
function pick(newCode, legacyCode = 0) {
    return exitCodesEnabled() ? newCode : legacyCode;
}

module.exports = {
    EXIT,
    classifyLoginError,
    loginErrorExitCode,
    LOGIN_EXIT,
    disconnectExitCode,
    DISCONNECT_EXIT,
    exitCodesEnabled,
    pick
};
