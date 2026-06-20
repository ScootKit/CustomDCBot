/*
 * Unit tests for the pure duty helpers in commands/duty.js (exported via
 * module.exports._test for testability) plus the duty-type autocomplete handlers:
 *
 *   - getLookbackDate(): All-time -> null, Weekly -> 7 days back, Monthly ->
 *     1 month back, defaulting to Weekly when unset
 *   - canUseDutyAdmin(): delegates to checkStaffPermissions at supervisor level
 *   - getQuotaForMember(): disabled / no-quota cases, and picking the quota for
 *     the member's highest-positioned matching role
 *   - applyBreakElapsedToShift(): pushes the shift start forward by the elapsed
 *     break time, ignoring missing / future / invalid break starts
 *   - autoComplete.manage/leaderboard/time.type: filtering configured duty types
 *     by the focused prefix (leaderboard/time prepend an "All" option)
 *
 * The sibling staff-management helpers are real (checkStaffPermissions is pure);
 * localize/getConfig come through the deterministic stubs.
 */

const duty = require('../../modules/staff-management-system/commands/duty');
const {
    getLookbackDate,
    canUseDutyAdmin,
    getQuotaForMember,
    applyBreakElapsedToShift
} = duty._test;

describe('getLookbackDate', () => {
    test('All-time returns null', () => {
        expect(getLookbackDate({leaderboardLookback: 'All-time'})).toBeNull();
    });

    test('Weekly returns roughly 7 days ago', () => {
        const d = getLookbackDate({leaderboardLookback: 'Weekly'});
        const days = (Date.now() - d.getTime()) / 86400000;
        expect(days).toBeGreaterThan(6.9);
        expect(days).toBeLessThan(7.1);
    });

    test('Monthly returns about a month ago', () => {
        const d = getLookbackDate({leaderboardLookback: 'Monthly'});
        expect(d.getTime()).toBeLessThan(Date.now());
        // at least ~27 days back
        expect((Date.now() - d.getTime()) / 86400000).toBeGreaterThan(27);
    });

    test('defaults to Weekly when no lookback is configured', () => {
        const d = getLookbackDate({});
        const days = (Date.now() - d.getTime()) / 86400000;
        expect(days).toBeGreaterThan(6.9);
        expect(days).toBeLessThan(7.1);
    });
});

describe('canUseDutyAdmin', () => {
    function client(generalConfig) {
        return {configurations: {'staff-management-system': {configuration: generalConfig}}};
    }

    function member(roleIds, {admin = false} = {}) {
        return {
            permissions: {has: (p) => admin && p === 'Administrator'},
            roles: {cache: {some: (fn) => roleIds.some(id => fn({id}))}}
        };
    }

    test('grants access to supervisors and management', () => {
        const c = client({
            supervisorRoles: ['sup'],
            managementRoles: ['mgmt']
        });
        expect(canUseDutyAdmin(c, member(['sup']))).toBe(true);
        expect(canUseDutyAdmin(c, member(['mgmt']))).toBe(true);
    });

    test('denies plain staff', () => {
        const c = client({
            staffRoles: ['staff'],
            supervisorRoles: ['sup']
        });
        expect(canUseDutyAdmin(c, member(['staff']))).toBe(false);
    });

    test('admins always pass', () => {
        const c = client({});
        expect(canUseDutyAdmin(c, member([], {admin: true}))).toBe(true);
    });
});

describe('getQuotaForMember', () => {
    function member(roleIds, positions = {}) {
        return {
            guild: {roles: {cache: {get: (id) => (positions[id] !== undefined ? {position: positions[id]} : null)}}},
            roles: {cache: {has: (id) => roleIds.includes(id)}}
        };
    }

    test('returns null when quotas are disabled', () => {
        expect(getQuotaForMember(member([]), {
            enableQuotas: false,
            quotas: {r1: '5'}
        })).toBeNull();
    });

    test('returns null when there are no configured quotas', () => {
        expect(getQuotaForMember(member([]), {
            enableQuotas: true,
            quotas: {}
        })).toBeNull();
    });

    test('picks the quota for the highest-positioned matching role', () => {
        const m = member(['r1', 'r2'], {
            r1: 5,
            r2: 10
        });
        const quota = getQuotaForMember(m, {
            enableQuotas: true,
            quotas: {
                r1: '3',
                r2: '8'
            }
        });
        expect(quota).toEqual({
            roleId: 'r2',
            hours: 8
        });
    });

    test('ignores roles the member does not hold', () => {
        const m = member(['r1'], {
            r1: 5,
            r2: 10
        });
        const quota = getQuotaForMember(m, {
            enableQuotas: true,
            quotas: {
                r1: '3',
                r2: '8'
            }
        });
        expect(quota).toEqual({
            roleId: 'r1',
            hours: 3
        });
    });

    test('skips quotas with a non-numeric hour value', () => {
        const m = member(['r1'], {r1: 5});
        expect(getQuotaForMember(m, {
            enableQuotas: true,
            quotas: {r1: 'abc'}
        })).toBeNull();
    });
});

describe('applyBreakElapsedToShift', () => {
    test('pushes the shift start forward by the elapsed break', async () => {
        const start = new Date('2024-01-01T00:00:00Z');
        const update = jest.fn().mockResolvedValue();
        const shift = {
            startTime: start,
            update
        };
        const breakStart = new Date('2024-01-01T00:00:00Z');
        const now = new Date('2024-01-01T00:10:00Z'); // 10 minutes of break
        await applyBreakElapsedToShift(shift, breakStart, now);
        const newStart = update.mock.calls[0][0].startTime;
        expect(newStart.getTime() - start.getTime()).toBe(10 * 60 * 1000);
    });

    test('does nothing without an active shift or break start', async () => {
        const update = jest.fn();
        await applyBreakElapsedToShift(null, new Date());
        await applyBreakElapsedToShift({
            startTime: new Date(),
            update
        }, null);
        expect(update).not.toHaveBeenCalled();
    });

    test('ignores a future or invalid break start', async () => {
        const update = jest.fn();
        const shift = {
            startTime: new Date(),
            update
        };
        await applyBreakElapsedToShift(shift, new Date(Date.now() + 60000)); // future
        await applyBreakElapsedToShift(shift, 'not-a-date');
        expect(update).not.toHaveBeenCalled();
    });
});

describe('duty type autocomplete', () => {
    function interaction(value, dutyTypes) {
        return {
            value,
            client: {configurations: {'staff-management-system': {shifts: {dutyTypes}}}},
            respond: jest.fn().mockResolvedValue()
        };
    }

    test('manage.type filters configured duty types by prefix', async () => {
        const i = interaction('mod', ['Moderator', 'Helper', 'Mentor']);
        await duty.autoComplete.manage.type(i);
        const choices = i.respond.mock.calls[0][0].map(c => c.value);
        expect(choices).toEqual(['Moderator']);
    });

    test('manage.type defaults to ["Staff"] when none configured', async () => {
        const i = interaction('', []);
        await duty.autoComplete.manage.type(i);
        expect(i.respond.mock.calls[0][0].map(c => c.value)).toEqual(['Staff']);
    });

    test('leaderboard.type prepends an "All" option', async () => {
        const i = interaction('a', ['Admin', 'Helper']);
        await duty.autoComplete.leaderboard.type(i);
        const choices = i.respond.mock.calls[0][0].map(c => c.value);
        // "All" and "Admin" both start with "a" (case-insensitive)
        expect(choices).toEqual(expect.arrayContaining(['All', 'Admin']));
        expect(choices).not.toContain('Helper');
    });

    test('time.type also offers the "All" option', async () => {
        const i = interaction('', ['Staff']);
        await duty.autoComplete.time.type(i);
        expect(i.respond.mock.calls[0][0].map(c => c.value)).toEqual(['All', 'Staff']);
    });
});