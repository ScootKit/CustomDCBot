/*
 * Stub localize before requiring baseRoles, since the real module (loaded lazily inside
 * runSync) pulls in main.js via its top-level require chain and would crash the test runner.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));

const {
    isInHoldingState,
    evaluateMember,
    runSync
} = require('../../modules/welcomer/baseRoles');

/**
 * Builds a GuildMember-shaped stub for testing.
 * @param {Object} [opts]
 * @returns {Object}
 */
function makeMember(opts = {}) {
    return {
        id: opts.id || 'u1',
        user: {bot: !!opts.bot},
        pending: !!opts.pending,
        roles: {
            cache: {
                has: (id) => (opts.roleIDs || []).includes(id)
            }
        }
    };
}

/**
 * Builds a Client-shaped stub for testing.
 * @param {Object} [opts]
 * @returns {Object}
 */
function makeClient(opts = {}) {
    return {
        configurations: {
            welcomer: {
                config: {
                    'assign-roles-immediately': opts.assignImmediately !== false,
                    'give-roles-on-join': opts.joinRoles || ['r1', 'r2']
                }
            },
            moderation: {
                config: {'quarantine-role-id': opts.quarantineRoleID || 'qrole'},
                joinGate: {
                    enabled: !!opts.joinGateEnabled,
                    action: opts.joinGateAction || 'give-role',
                    roleID: opts.joinGateRoleID || 'jgrole'
                },
                antiJoinRaid: {
                    enabled: !!opts.antiRaidEnabled,
                    action: opts.antiRaidAction || 'give-role',
                    roleID: opts.antiRaidRoleID || 'arrole'
                }
            }
        },
        modules: {moderation: {enabled: opts.moderationEnabled !== false}},
        models: {
            moderation: {
                QuarantineState: {
                    findByPk: async (id) => {
                        return (opts.quarantineStateRows || []).includes(id) ? {victimID: id} : null;
                    }
                }
            }
        }
    };
}

describe('isInHoldingState', () => {
    test('returns true for bots', async () => {
        const member = makeMember({bot: true});
        expect(await isInHoldingState(member, makeClient())).toBe(true);
    });

    test('returns true when member holds the quarantine role', async () => {
        const member = makeMember({roleIDs: ['qrole']});
        expect(await isInHoldingState(member, makeClient())).toBe(true);
    });

    test('returns true when a QuarantineState row exists', async () => {
        const member = makeMember({id: 'u1'});
        const client = makeClient({quarantineStateRows: ['u1']});
        expect(await isInHoldingState(member, client)).toBe(true);
    });

    test('returns true when member holds the JoinGate hold role and JoinGate uses give-role', async () => {
        const member = makeMember({roleIDs: ['jgrole']});
        const client = makeClient({joinGateEnabled: true});
        expect(await isInHoldingState(member, client)).toBe(true);
    });

    test('returns false when JoinGate hold role present but JoinGate disabled', async () => {
        const member = makeMember({roleIDs: ['jgrole']});
        const client = makeClient({joinGateEnabled: false});
        expect(await isInHoldingState(member, client)).toBe(false);
    });

    test('returns true when member holds the anti-raid hold role and anti-raid uses give-role', async () => {
        const member = makeMember({roleIDs: ['arrole']});
        const client = makeClient({antiRaidEnabled: true});
        expect(await isInHoldingState(member, client)).toBe(true);
    });

    test('returns true when member is pending and assign-roles-immediately is false', async () => {
        const member = makeMember({pending: true});
        const client = makeClient({assignImmediately: false});
        expect(await isInHoldingState(member, client)).toBe(true);
    });

    test('returns false when member is pending but assign-roles-immediately is true', async () => {
        const member = makeMember({pending: true});
        const client = makeClient({assignImmediately: true});
        expect(await isInHoldingState(member, client)).toBe(false);
    });

    test('returns false for a regular non-bot member with no holding markers', async () => {
        const member = makeMember();
        expect(await isInHoldingState(member, makeClient())).toBe(false);
    });

    test('returns false when moderation module is disabled (no quarantine/joinGate/raid checks apply)', async () => {
        const member = makeMember({roleIDs: ['qrole']});
        const client = makeClient({moderationEnabled: false});
        expect(await isInHoldingState(member, client)).toBe(false);
    });
});

describe('evaluateMember', () => {
    test('returns skip=true for members in holding state', async () => {
        const member = makeMember({bot: true});
        const out = await evaluateMember(member, makeClient());
        expect(out.skip).toBe(true);
        expect(out.missingRoleIDs).toEqual([]);
    });

    test('returns the list of missing join roles for a regular member', async () => {
        const member = makeMember({roleIDs: ['r1']});
        const out = await evaluateMember(member, makeClient({joinRoles: ['r1', 'r2', 'r3']}));
        expect(out.skip).toBe(false);
        expect(out.missingRoleIDs).toEqual(['r2', 'r3']);
    });

    test('returns missingRoleIDs=[] when the member already has all join roles', async () => {
        const member = makeMember({roleIDs: ['r1', 'r2']});
        const out = await evaluateMember(member, makeClient({joinRoles: ['r1', 'r2']}));
        expect(out.skip).toBe(false);
        expect(out.missingRoleIDs).toEqual([]);
    });

    test('handles empty give-roles-on-join configuration', async () => {
        const member = makeMember();
        const out = await evaluateMember(member, makeClient({joinRoles: []}));
        expect(out.skip).toBe(false);
        expect(out.missingRoleIDs).toEqual([]);
    });
});

describe('runSync', () => {

    /**
     * Full Client stub including guild.members.cache and a no-op logger.
     * @param {Object} [overrides]
     * @returns {Object}
     */
    function makeFullClient(overrides = {}) {
        const cache = new Map();
        (overrides.members || []).forEach(m => cache.set(m.id, m));
        return {
            configurations: {
                welcomer: {
                    config: {
                        'treat-welcome-roles-as-base-roles': overrides.enabled !== false,
                        'give-roles-on-join': overrides.joinRoles || ['r1', 'r2'],
                        'assign-roles-immediately': true
                    }
                },
                moderation: {
                    config: {'quarantine-role-id': 'qrole'},
                    joinGate: {enabled: false, action: 'give-role', roleID: 'jgrole'},
                    antiJoinRaid: {enabled: false, action: 'give-role', roleID: 'arrole'}
                }
            },
            modules: {moderation: {enabled: true}},
            models: {moderation: {QuarantineState: {findByPk: async () => null}}},
            guild: {members: {cache}},
            logger: {
                info: () => {
                }, error: () => {
                }, warn: () => {
                }
            }
        };
    }

    /**
     * GuildMember stub with role-add side effects captured into addImpl.
     * @param {string} id
     * @param {string[]} [roleIDs]
     * @param {Object} [opts]
     * @returns {Object}
     */
    function makeRealMember(id, roleIDs = [], opts = {}) {
        return {
            id,
            user: {bot: !!opts.bot},
            pending: !!opts.pending,
            roles: {
                cache: {has: (rid) => roleIDs.includes(rid)},
                add: opts.addImpl || (async () => {
                })
            }
        };
    }

    test('does nothing when the option is disabled', async () => {
        const adds = [];
        const member = makeRealMember('u1', [], {addImpl: async (r) => adds.push(r)});
        const client = makeFullClient({enabled: false, members: [member]});
        const result = await runSync(client);
        expect(result).toBeUndefined();
        expect(adds).toEqual([]);
    });

    test('grants missing join roles to a regular member', async () => {
        const adds = [];
        const member = makeRealMember('u1', ['r1'], {addImpl: async (r) => adds.push(r)});
        const client = makeFullClient({members: [member]});
        const result = await runSync(client);
        expect(result).toEqual({scanned: 1, granted: 1, skipped: 0, failed: 0});
        expect(adds.length).toBe(1);
        expect(adds[0]).toEqual(['r2']);
    });

    test('skips members in holding state', async () => {
        const adds = [];
        const member = makeRealMember('u1', ['qrole'], {addImpl: async (r) => adds.push(r)});
        const client = makeFullClient({members: [member]});
        const result = await runSync(client);
        expect(result).toEqual({scanned: 1, granted: 0, skipped: 1, failed: 0});
        expect(adds).toEqual([]);
    });

    test('skips members who already have all join roles', async () => {
        const member = makeRealMember('u1', ['r1', 'r2']);
        const client = makeFullClient({members: [member]});
        const result = await runSync(client);
        expect(result).toEqual({scanned: 1, granted: 0, skipped: 1, failed: 0});
    });

    test('counts a failure when roles.add rejects', async () => {
        const member = makeRealMember('u1', [], {
            addImpl: async () => {
                throw new Error('Missing Permissions');
            }
        });
        const client = makeFullClient({members: [member]});
        const result = await runSync(client);
        expect(result).toEqual({scanned: 1, granted: 0, skipped: 0, failed: 1});
    });
});