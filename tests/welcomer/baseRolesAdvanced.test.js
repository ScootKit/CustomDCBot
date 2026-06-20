/*
 * Tests for the welcomer base-role reactive helpers in baseRoles.js that the
 * existing baseRoles.test.js does not cover: handleHoldingRelease, checkWatchdog,
 * and the guard/debounce wiring of handleRoleRemoval.
 *
 *  - handleHoldingRelease: when a quarantine/JoinGate/anti-raid hold role is removed
 *    and the member is no longer held, missing join roles are re-granted.
 *  - checkWatchdog: after a re-add we watch for a quarantine role appearing within
 *    the window and revert the just-granted roles.
 *  - handleRoleRemoval: short-circuits when base roles aren't enabled / no removal
 *    happened, and otherwise schedules a debounced re-add (asserted via the pending
 *    debounce map + the deferred fetch).
 */
const baseRoles = require('../../modules/welcomer/baseRoles');
const {
    handleHoldingRelease,
    checkWatchdog,
    handleRoleRemoval,
    _state
} = baseRoles;

beforeEach(() => {
    jest.useFakeTimers();
    _state.recentReadds.clear();
    _state.watchdogTimers.clear();
    _state.pendingDebounces.clear();
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

function roleCache(ids) {
    return {cache: {has: (id) => ids.includes(id)}};
}

function makeMember(id, roleIds, extra = {}) {
    return {
        id,
        roles: {
            ...roleCache(roleIds),
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue()
        },
        ...extra
    };
}

function makeClient({
                        joinRoles = ['baseRole'],
                        baseRolesEnabled = true,
                        moderation = null
                    } = {}) {
    const client = {
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        },
        configurations: {
            welcomer: {
                config: {
                    'treat-welcome-roles-as-base-roles': baseRolesEnabled,
                    'give-roles-on-join': joinRoles,
                    'assign-roles-immediately': true
                }
            }
        }
    };
    if (moderation) {
        client.modules = {moderation: {enabled: true}};
        client.configurations.moderation = moderation;
    }
    return client;
}

describe('handleHoldingRelease', () => {
    test('grants missing join roles when a quarantine hold is released', async () => {
        const client = makeClient({
            moderation: {config: {'quarantine-role-id': 'qRole'}}
        });
        const oldMember = makeMember('m1', ['qRole']); // was quarantined
        const newMember = makeMember('m1', []);        // quarantine removed, missing baseRole
        await handleHoldingRelease(client, oldMember, newMember);
        expect(newMember.roles.add).toHaveBeenCalledWith(['baseRole'], expect.any(String));
        expect(client.logger.info).toHaveBeenCalled();
    });

    test('does nothing when base-role treatment is disabled', async () => {
        const client = makeClient({
            baseRolesEnabled: false,
            moderation: {config: {'quarantine-role-id': 'qRole'}}
        });
        const oldMember = makeMember('m1', ['qRole']);
        const newMember = makeMember('m1', []);
        await handleHoldingRelease(client, oldMember, newMember);
        expect(newMember.roles.add).not.toHaveBeenCalled();
    });

    test('does nothing when no hold role was actually released', async () => {
        const client = makeClient({moderation: {config: {'quarantine-role-id': 'qRole'}}});
        const oldMember = makeMember('m1', []); // never held
        const newMember = makeMember('m1', []);
        await handleHoldingRelease(client, oldMember, newMember);
        expect(newMember.roles.add).not.toHaveBeenCalled();
    });

    test('does not grant when the member already has every join role', async () => {
        const client = makeClient({moderation: {config: {'quarantine-role-id': 'qRole'}}});
        const oldMember = makeMember('m1', ['qRole']);
        const newMember = makeMember('m1', ['baseRole']); // already has it
        await handleHoldingRelease(client, oldMember, newMember);
        expect(newMember.roles.add).not.toHaveBeenCalled();
    });

    test('does not grant while the member is still in another holding state', async () => {
        // quarantine released but the member now holds the JoinGate hold role
        const client = makeClient({
            moderation: {
                config: {'quarantine-role-id': 'qRole'},
                joinGate: {
                    enabled: true,
                    action: 'give-role',
                    roleID: 'gateRole'
                }
            }
        });
        const oldMember = makeMember('m1', ['qRole', 'gateRole']);
        const newMember = makeMember('m1', ['gateRole']); // still gated
        await handleHoldingRelease(client, oldMember, newMember);
        expect(newMember.roles.add).not.toHaveBeenCalled();
    });
});

describe('checkWatchdog', () => {
    test('reverts the granted roles when a quarantine role appears within the window', async () => {
        const client = makeClient({moderation: {config: {'quarantine-role-id': 'qRole'}}});
        // Seed an active watchdog directly.
        _state.watchdogTimers.set('m1', {
            timer: setTimeout(() => {
            }, 5000),
            quarantineRoleID: 'qRole',
            grantedRoleIDs: ['baseRole'],
            deadline: Date.now() + 5000
        });
        const oldMember = makeMember('m1', []);          // no quarantine before
        const newMember = makeMember('m1', ['qRole']);   // quarantine appeared
        await checkWatchdog(client, oldMember, newMember);
        expect(newMember.roles.remove).toHaveBeenCalledWith(['baseRole'], expect.any(String));
        expect(_state.watchdogTimers.has('m1')).toBe(false);
    });

    test('does nothing when no watchdog is active for the member', async () => {
        const client = makeClient();
        const newMember = makeMember('m1', ['qRole']);
        await checkWatchdog(client, makeMember('m1', []), newMember);
        expect(newMember.roles.remove).not.toHaveBeenCalled();
    });

    test('clears an expired watchdog without reverting', async () => {
        const client = makeClient();
        _state.watchdogTimers.set('m1', {
            timer: setTimeout(() => {
            }, 5000),
            quarantineRoleID: 'qRole',
            grantedRoleIDs: ['baseRole'],
            deadline: Date.now() - 1 // already expired
        });
        const newMember = makeMember('m1', ['qRole']);
        await checkWatchdog(client, makeMember('m1', []), newMember);
        expect(newMember.roles.remove).not.toHaveBeenCalled();
        expect(_state.watchdogTimers.has('m1')).toBe(false);
    });
});

describe('handleRoleRemoval guards + debounce', () => {
    test('short-circuits when base-role treatment is disabled', async () => {
        const client = makeClient({baseRolesEnabled: false});
        const oldMember = makeMember('m1', ['baseRole']);
        const newMember = makeMember('m1', []);
        await handleRoleRemoval(client, oldMember, newMember);
        expect(_state.pendingDebounces.has('m1')).toBe(false);
    });

    test('does nothing when no join role was removed', async () => {
        const client = makeClient();
        const oldMember = makeMember('m1', ['baseRole']);
        const newMember = makeMember('m1', ['baseRole']); // unchanged
        await handleRoleRemoval(client, oldMember, newMember);
        expect(_state.pendingDebounces.has('m1')).toBe(false);
    });

    test('schedules a debounced re-add when a join role is removed', async () => {
        const client = makeClient();
        const oldMember = makeMember('m1', ['baseRole']);
        const newMember = makeMember('m1', []);
        // members.fetch returns a member that already has the role -> re-add no-ops, but the
        // important assertion is that a debounce timer was registered.
        newMember.guild = {members: {fetch: jest.fn().mockResolvedValue(makeMember('m1', ['baseRole']))}};
        await handleRoleRemoval(client, oldMember, newMember);
        expect(_state.pendingDebounces.has('m1')).toBe(true);
        // drive the debounce; the fetch should fire and the pending entry cleared
        await jest.advanceTimersByTimeAsync(1500);
        expect(newMember.guild.members.fetch).toHaveBeenCalled();
        expect(_state.pendingDebounces.has('m1')).toBe(false);
    });

    test('ignores a second removal while a debounce is already pending', async () => {
        const client = makeClient();
        const oldMember = makeMember('m1', ['baseRole']);
        const newMember = makeMember('m1', []);
        newMember.guild = {members: {fetch: jest.fn().mockResolvedValue(makeMember('m1', ['baseRole']))}};
        await handleRoleRemoval(client, oldMember, newMember);
        const firstTimer = _state.pendingDebounces.get('m1');
        await handleRoleRemoval(client, oldMember, newMember); // second call, still pending
        expect(_state.pendingDebounces.get('m1')).toBe(firstTimer);
    });
});