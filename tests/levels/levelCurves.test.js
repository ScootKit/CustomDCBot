/*
 * Pure-logic tests for the levels XP curve helpers exported from
 * modules/levels/events/messageCreate.js:
 *   - calculateLevelXP: the three built-in level->XP formulas (EXPONENTIAL,
 *     LINEAR, EXPONENTIATION) plus the CUSTOM-formula fallback.
 *   - isMaxLevel: respects maximumLevelEnabled and the startFromZero offset.
 *   - displayLevel: subtracts the startFromZero offset and clamps to the cap.
 *   - getMemberRoleFactor: multiplies the configured per-role factors together.
 */

const {
    calculateLevelXP,
    isMaxLevel,
    displayLevel,
    getMemberRoleFactor
} = require('../../modules/levels/events/messageCreate');

function makeClient(config = {}) {
    return {
        configurations: {
            levels: {
                config: {
                    curveType: 'EXPONENTIAL',
                    startFromZero: false,
                    maximumLevelEnabled: false,
                    maximumLevel: 100,
                    multiplication_roles: {},
                    ...config
                }
            }
        }
    };
}

describe('calculateLevelXP - built-in curves', () => {
    test('EXPONENTIAL: x*750 + (x-1)*500', () => {
        const client = makeClient({curveType: 'EXPONENTIAL'});
        expect(calculateLevelXP(client, 1)).toBe(750); // 750 + 0
        expect(calculateLevelXP(client, 2)).toBe(2000); // 1500 + 500
        expect(calculateLevelXP(client, 10)).toBe(12000); // 7500 + 4500
    });

    test('LINEAR: x*750', () => {
        const client = makeClient({curveType: 'LINEAR'});
        expect(calculateLevelXP(client, 1)).toBe(750);
        expect(calculateLevelXP(client, 4)).toBe(3000);
    });

    test('EXPONENTIATION: 350*(x-1)^2', () => {
        const client = makeClient({curveType: 'EXPONENTIATION'});
        expect(calculateLevelXP(client, 1)).toBe(0); // 350*0
        expect(calculateLevelXP(client, 3)).toBe(1400); // 350*4
        expect(calculateLevelXP(client, 11)).toBe(35000); // 350*100
    });

    test('curve is monotonically increasing (required by the level-up loop)', () => {
        const client = makeClient({curveType: 'EXPONENTIAL'});
        let last = -Infinity;
        for (let level = 1; level <= 50; level++) {
            const required = calculateLevelXP(client, level);
            expect(required).toBeGreaterThan(last);
            last = required;
        }
    });
});

describe('isMaxLevel', () => {
    test('returns false when maximum level is disabled', () => {
        const client = makeClient({
            maximumLevelEnabled: false,
            maximumLevel: 10
        });
        expect(isMaxLevel(999, client)).toBe(false);
    });

    test('true once the level reaches the cap (startFromZero=false)', () => {
        const client = makeClient({
            maximumLevelEnabled: true,
            maximumLevel: 10,
            startFromZero: false
        });
        expect(isMaxLevel(9, client)).toBe(false);
        expect(isMaxLevel(10, client)).toBe(true);
        expect(isMaxLevel(11, client)).toBe(true);
    });

    test('startFromZero shifts the internal level by one', () => {
        const client = makeClient({
            maximumLevelEnabled: true,
            maximumLevel: 10,
            startFromZero: true
        });
        // internal level 10 -> displayed 9, not yet capped
        expect(isMaxLevel(10, client)).toBe(false);
        // internal level 11 -> displayed 10, capped
        expect(isMaxLevel(11, client)).toBe(true);
    });
});

describe('displayLevel', () => {
    test('returns the level unchanged when startFromZero is false', () => {
        const client = makeClient({startFromZero: false});
        expect(displayLevel(5, client)).toBe('5');
    });

    test('subtracts one when startFromZero is true', () => {
        const client = makeClient({startFromZero: true});
        expect(displayLevel(5, client)).toBe('4');
    });

    test('clamps to the maximum level once capped', () => {
        const client = makeClient({
            maximumLevelEnabled: true,
            maximumLevel: 10,
            startFromZero: false
        });
        expect(displayLevel(50, client)).toBe('10');
    });
});

describe('getMemberRoleFactor', () => {
    function makeMember(client, roleIds) {
        const roles = roleIds.map(id => ({id}));
        return {
            client,
            roles: {
                cache: {
                    filter(fn) {
                        return {values: () => roles.filter(fn)};
                    }
                }
            }
        };
    }

    test('returns 1 when the member has no multiplier roles', () => {
        const client = makeClient({multiplication_roles: {r1: '2'}});
        const member = makeMember(client, ['other']);
        expect(getMemberRoleFactor(member)).toBe(1);
    });

    test('returns the single configured factor', () => {
        const client = makeClient({multiplication_roles: {r1: '2.5'}});
        const member = makeMember(client, ['r1']);
        expect(getMemberRoleFactor(member)).toBe(2.5);
    });

    test('multiplies multiple role factors together', () => {
        const client = makeClient({
            multiplication_roles: {
                r1: '2',
                r2: '3'
            }
        });
        const member = makeMember(client, ['r1', 'r2', 'noise']);
        expect(getMemberRoleFactor(member)).toBe(6);
    });
});