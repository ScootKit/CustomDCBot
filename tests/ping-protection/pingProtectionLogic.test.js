/*
 * Unit tests for ping-protection's core logic helpers.
 *
 * Covers:
 *  - isWhitelistedChannel: channel + parent matching against ignoredChannels.
 *  - getSafeChannelId: array/string/garbage normalisation + length guard.
 *  - getRequiredPingCountForMember: base count fallbacks, role-based
 *    thresholds, exempt (0) handling, and highest-role selection.
 *  - getDeletionTypeLocaleKey: data-type -> locale key mapping.
 *  - setDeletionCooldown: 24h (partial) vs 168h (full) window via upsert.
 *  - getDeletionCooldown: expiry cleanup vs active cooldown.
 */
const pp = require('../../modules/ping-protection/ping-protection');

describe('isWhitelistedChannel', () => {
    const cfg = {ignoredChannels: ['100', '200']};

    test('false when channel is null or config missing list', () => {
        expect(pp.isWhitelistedChannel(cfg, null)).toBe(false);
        expect(pp.isWhitelistedChannel({}, {id: '100'})).toBe(false);
        expect(pp.isWhitelistedChannel({ignoredChannels: []}, {id: '100'})).toBe(false);
    });

    test('matches by channel id', () => {
        expect(pp.isWhitelistedChannel(cfg, {id: '100'})).toBe(true);
        expect(pp.isWhitelistedChannel(cfg, {id: '999'})).toBe(false);
    });

    test('matches by parent (category) id', () => {
        expect(pp.isWhitelistedChannel(cfg, {
            id: '999',
            parentId: '200'
        })).toBe(true);
    });

    test('numeric ids in config still match string channel ids', () => {
        expect(pp.isWhitelistedChannel({ignoredChannels: [100]}, {id: '100'})).toBe(true);
    });
});

describe('getSafeChannelId', () => {
    test('returns null for falsy / empty', () => {
        expect(pp.getSafeChannelId(null)).toBeNull();
        expect(pp.getSafeChannelId([])).toBeNull();
    });

    test('extracts first element of an array', () => {
        expect(pp.getSafeChannelId(['123456789'])).toBe('123456789');
    });

    test('accepts a plain string', () => {
        expect(pp.getSafeChannelId('123456789')).toBe('123456789');
    });

    test('rejects ids that are too short (<= 5 chars)', () => {
        expect(pp.getSafeChannelId('123')).toBeNull();
        expect(pp.getSafeChannelId(['12'])).toBeNull();
    });

    test('returns null for a bare number (only arrays/strings are accepted)', () => {
        expect(pp.getSafeChannelId(123456789)).toBeNull();
    });

    test('coerces a numeric array element to string', () => {
        expect(pp.getSafeChannelId([123456789])).toBe('123456789');
    });
});

describe('getRequiredPingCountForMember', () => {
    function memberWithRoles(roles) {
        return {
            roles: {
                cache: {
                    filter(fn) {
                        const kept = roles.filter(fn);
                        return makeCollection(kept);
                    }
                }
            }
        };
    }

    function makeCollection(arr) {
        return {
            size: arr.length,
            sort(cmp) {
                return makeCollection([...arr].sort(cmp));
            },
            first() {
                return arr[0];
            },
            values() {
                return arr.values();
            }
        };
    }

    test('returns base count when thresholds disabled', () => {
        const rule = {
            pingsCount: 5,
            enableRolePingThresholds: false
        };
        expect(pp.getRequiredPingCountForMember(rule, null)).toBe(5);
    });

    test('falls back through pingsCountAdvanced / pingsCountBasic', () => {
        expect(pp.getRequiredPingCountForMember({pingsCountAdvanced: 7}, null)).toBe(7);
        expect(pp.getRequiredPingCountForMember({pingsCountBasic: 3}, null)).toBe(3);
    });

    test('returns null when no usable base count', () => {
        expect(pp.getRequiredPingCountForMember({}, null)).toBeNull();
        expect(pp.getRequiredPingCountForMember({pingsCount: 'nope'}, null)).toBeNull();
    });

    test('uses base count when member has no matching role', () => {
        const rule = {
            pingsCount: 5,
            enableRolePingThresholds: true,
            rolePingThresholds: {roleX: 2}
        };
        const member = memberWithRoles([{
            id: 'roleY',
            position: 1
        }]);
        expect(pp.getRequiredPingCountForMember(rule, member)).toBe(5);
    });

    test('returns EXEMPT when a matching role maps to 0', () => {
        const rule = {
            pingsCount: 5,
            enableRolePingThresholds: true,
            rolePingThresholds: {roleA: 0}
        };
        const member = memberWithRoles([{
            id: 'roleA',
            position: 1
        }]);
        expect(pp.getRequiredPingCountForMember(rule, member)).toBe(pp.EXEMPT_THRESHOLD);
    });

    test('uses highest-position matching role threshold', () => {
        const rule = {
            pingsCount: 5,
            enableRolePingThresholds: true,
            rolePingThresholds: {
                low: 10,
                high: 2
            }
        };
        const member = memberWithRoles([
            {
                id: 'low',
                position: 1
            },
            {
                id: 'high',
                position: 9
            }
        ]);
        expect(pp.getRequiredPingCountForMember(rule, member)).toBe(2);
    });
});

describe('getDeletionTypeLocaleKey', () => {
    test('maps each known data type', () => {
        expect(pp.getDeletionTypeLocaleKey('del_ping_history')).toBe('del-type-pings');
        expect(pp.getDeletionTypeLocaleKey('del_moderation_history')).toBe('del-type-actions');
        expect(pp.getDeletionTypeLocaleKey('del_all')).toBe('del-type-all');
    });

    test('falls back to unknown', () => {
        expect(pp.getDeletionTypeLocaleKey('something-else')).toBe('del-type-unknown');
    });
});

describe('deletion cooldown windows', () => {
    function clientWithCooldownModel(impl) {
        return {models: {'ping-protection': {DeletionCooldown: impl}}};
    }

    test('setDeletionCooldown uses 24h for partial deletions', async () => {
        const upsert = jest.fn().mockResolvedValue();
        const client = clientWithCooldownModel({upsert});
        const before = Date.now();
        const blockedUntil = await pp.setDeletionCooldown(client, 'u1', 'del_ping_history', 'mod1');
        const diffHours = (blockedUntil.getTime() - before) / 3600000;
        expect(diffHours).toBeGreaterThan(23.9);
        expect(diffHours).toBeLessThan(24.1);
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'u1',
            lastDeletionType: 'del_ping_history',
            lastDeletedBy: 'mod1'
        }));
    });

    test('setDeletionCooldown uses 168h (7d) for del_all', async () => {
        const upsert = jest.fn().mockResolvedValue();
        const client = clientWithCooldownModel({upsert});
        const before = Date.now();
        const blockedUntil = await pp.setDeletionCooldown(client, 'u1', 'del_all');
        const diffHours = (blockedUntil.getTime() - before) / 3600000;
        expect(diffHours).toBeGreaterThan(167.9);
        expect(diffHours).toBeLessThan(168.1);
    });

    test('getDeletionCooldown destroys & returns null when expired', async () => {
        const destroy = jest.fn().mockResolvedValue();
        const expired = {
            blockedUntil: new Date(Date.now() - 1000),
            destroy
        };
        const client = clientWithCooldownModel({findByPk: jest.fn().mockResolvedValue(expired)});
        const result = await pp.getDeletionCooldown(client, 'u1');
        expect(result).toBeNull();
        expect(destroy).toHaveBeenCalled();
    });

    test('getDeletionCooldown returns the active cooldown', async () => {
        const active = {
            blockedUntil: new Date(Date.now() + 60000),
            destroy: jest.fn()
        };
        const client = clientWithCooldownModel({findByPk: jest.fn().mockResolvedValue(active)});
        const result = await pp.getDeletionCooldown(client, 'u1');
        expect(result).toBe(active);
        expect(active.destroy).not.toHaveBeenCalled();
    });
});