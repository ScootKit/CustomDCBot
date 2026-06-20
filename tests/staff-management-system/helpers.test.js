/*
 * Pure-logic tests for the staff-management-system helper functions exported
 * from staff-management.js:
 *   - checkStaffPermissions(): admin shortcut, per-level role gating
 *     (staff/supervisor/management), and the no-member / no-roles defaults
 *   - parseDurationToDays(): parses "5d"/"2w"/"3m" duration strings to days,
 *     defaulting the unit to days, and rejecting malformed input
 *   - getSafeChannelId(): coerces array/string channel config into a single id
 *   - formatDuration(): humanises a second count into h/m/s parts
 *   - getIsoWeekNumber(): ISO-8601 week numbers for known dates
 *
 * localize is auto-stubbed by jest.config moduleNameMapper, so the formatted
 * strings carry deterministic "namespace.key" tokens we can assert against.
 */

const {
    checkStaffPermissions,
    parseDurationToDays,
    getSafeChannelId,
    formatDuration,
    getIsoWeekNumber
} = require('../../modules/staff-management-system/staff-management');

function member(roleIds, {admin = false} = {}) {
    return {
        permissions: {has: (p) => admin && p === 'Administrator'},
        roles: {cache: {some: (fn) => roleIds.some(id => fn({id}))}}
    };
}

const config = {
    staffRoles: ['staff'],
    supervisorRoles: ['sup'],
    managementRoles: ['mgmt']
};

describe('checkStaffPermissions', () => {
    test('returns false when no member is supplied', () => {
        expect(checkStaffPermissions(null, config, 'staff')).toBe(false);
    });

    test('administrators always pass regardless of level', () => {
        expect(checkStaffPermissions(member([], {admin: true}), config, 'management')).toBe(true);
    });

    test('staff level accepts staff, supervisor and management roles', () => {
        expect(checkStaffPermissions(member(['staff']), config, 'staff')).toBe(true);
        expect(checkStaffPermissions(member(['sup']), config, 'staff')).toBe(true);
        expect(checkStaffPermissions(member(['mgmt']), config, 'staff')).toBe(true);
    });

    test('supervisor level rejects plain staff but accepts supervisor/management', () => {
        expect(checkStaffPermissions(member(['staff']), config, 'supervisor')).toBe(false);
        expect(checkStaffPermissions(member(['sup']), config, 'supervisor')).toBe(true);
        expect(checkStaffPermissions(member(['mgmt']), config, 'supervisor')).toBe(true);
    });

    test('management level only accepts management roles', () => {
        expect(checkStaffPermissions(member(['sup']), config, 'management')).toBe(false);
        expect(checkStaffPermissions(member(['mgmt']), config, 'management')).toBe(true);
    });

    test('a member with none of the configured roles is rejected', () => {
        expect(checkStaffPermissions(member(['other']), config, 'staff')).toBe(false);
    });

    test('defaults to the staff level for an unknown level', () => {
        expect(checkStaffPermissions(member(['staff']), config, 'bogus')).toBe(true);
    });
});

describe('parseDurationToDays', () => {
    test('returns null for empty/invalid input', () => {
        expect(parseDurationToDays(null)).toBeNull();
        expect(parseDurationToDays('')).toBeNull();
        expect(parseDurationToDays('abc')).toBeNull();
        expect(parseDurationToDays('5x')).toBeNull();
    });

    test('defaults a bare number to days', () => {
        expect(parseDurationToDays('5')).toBe(5);
        expect(parseDurationToDays('5d')).toBe(5);
    });

    test('converts weeks and months', () => {
        expect(parseDurationToDays('2w')).toBe(14);
        expect(parseDurationToDays('3m')).toBe(90);
    });

    test('is case-insensitive on the unit', () => {
        expect(parseDurationToDays('1W')).toBe(7);
        expect(parseDurationToDays('1M')).toBe(30);
    });
});

describe('getSafeChannelId', () => {
    test('returns the first element of a non-empty array', () => {
        expect(getSafeChannelId(['a', 'b'])).toBe('a');
    });

    test('returns a plain string unchanged', () => {
        expect(getSafeChannelId('chan')).toBe('chan');
    });

    test('returns null for empty arrays and other types', () => {
        expect(getSafeChannelId([])).toBeNull();
        expect(getSafeChannelId(null)).toBeNull();
        expect(getSafeChannelId(undefined)).toBeNull();
        expect(getSafeChannelId(42)).toBeNull();
    });
});

describe('formatDuration', () => {
    test('returns the zero token for non-positive durations', () => {
        expect(formatDuration(0)).toContain('time-zero');
        expect(formatDuration(-5)).toContain('time-zero');
    });

    test('includes hours, minutes and seconds parts as needed', () => {
        const out = formatDuration(3661); // 1h 1m 1s
        expect(out).toContain('1 staff-management-system.time-hour');
        expect(out).toContain('1 staff-management-system.time-min');
        expect(out).toContain('1 staff-management-system.time-sec');
    });

    test('omits zero-valued parts', () => {
        const out = formatDuration(120); // exactly 2 minutes
        expect(out).toContain('2 staff-management-system.time-mins');
        expect(out).not.toContain('time-hour');
        expect(out).not.toContain('time-sec');
    });
});

describe('getIsoWeekNumber', () => {
    test('Jan 4th is always in ISO week 1', () => {
        expect(getIsoWeekNumber(new Date(Date.UTC(2024, 0, 4)))).toBe(1);
    });

    test('computes mid-year week numbers', () => {
        // 2024-07-01 is a Monday in ISO week 27.
        expect(getIsoWeekNumber(new Date(Date.UTC(2024, 6, 1)))).toBe(27);
    });

    test('Dec 31 2020 belongs to ISO week 53', () => {
        expect(getIsoWeekNumber(new Date(Date.UTC(2020, 11, 31)))).toBe(53);
    });
});
