/*
 * Additional edge coverage for the status-roles presenceUpdate handler that the
 * existing presenceUpdate.test.js does not exercise:
 *
 *   - when the status matches and moduleConfig.remove is enabled, all non-managed
 *     roles are stripped before the configured roles are (re-)added
 *   - managed roles are never stripped during that purge
 *   - multiple configured roles: the "already has all roles" short-circuit only
 *     triggers when the member holds the full set
 *   - an offline member whose status no longer matches still has roles removed
 *     when ignoreOfflineUsers is off
 */

const {ActivityType} = require('discord.js');
const handler = require('../../modules/status-roles/events/presenceUpdate');

function roleCache(roles) {
    // roles: array of {id, managed}
    return {
        filter(fn) {
            return roleCache(roles.filter(fn));
        },
        get size() {
            return roles.length;
        },
        _roles: roles
    };
}

function makeClient(configOverrides = {}) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        configurations: {
            'status-roles': {
                config: {
                    roles: ['role1'],
                    words: ['scootkit'],
                    remove: false,
                    ignoreOfflineUsers: false, ...configOverrides
                }
            }
        }
    };
}

function makePresence({
                          statusText = null,
                          memberRoles = [],
                          status = 'online'
                      } = {}) {
    const activities = statusText === null ? [] : [{
        type: ActivityType.Custom,
        state: statusText
    }];
    return {
        status,
        activities,
        member: {
            guild: {id: 'g1'},
            roles: {
                cache: roleCache(memberRoles),
                add: jest.fn().mockResolvedValue(),
                remove: jest.fn().mockResolvedValue()
            }
        }
    };
}

describe('status-roles remove-other-roles branch', () => {
    test('strips non-managed roles before adding the configured role when remove is on', async () => {
        const client = makeClient({
            remove: true,
            roles: ['role1']
        });
        const presence = makePresence({
            statusText: 'scootkit',
            memberRoles: [{
                id: 'old',
                managed: false
            }, {
                id: 'boost',
                managed: true
            }]
        });
        await handler.run(client, null, presence);
        // remove() was called with a (filtered) collection of non-managed roles
        const removedArg = presence.member.roles.remove.mock.calls[0][0];
        expect(removedArg._roles.map(r => r.id)).toEqual(['old']); // managed boost excluded
        expect(presence.member.roles.add).toHaveBeenCalledWith(['role1'], expect.any(String));
    });

    test('does not purge other roles when remove is off', async () => {
        const client = makeClient({remove: false});
        const presence = makePresence({
            statusText: 'scootkit',
            memberRoles: [{
                id: 'old',
                managed: false
            }]
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.remove).not.toHaveBeenCalled();
        expect(presence.member.roles.add).toHaveBeenCalled();
    });

    test('does not re-add only when the member holds ALL configured roles', async () => {
        const client = makeClient({roles: ['role1', 'role2']});
        // holds only role1 -> still needs role2, so add fires
        const presence = makePresence({
            statusText: 'scootkit',
            memberRoles: [{
                id: 'role1',
                managed: false
            }]
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.add).toHaveBeenCalledWith(['role1', 'role2'], expect.any(String));
    });

    test('removes roles from an offline non-matching member when ignoreOfflineUsers is off', async () => {
        const client = makeClient({ignoreOfflineUsers: false});
        const presence = makePresence({
            statusText: 'unrelated',
            memberRoles: [{
                id: 'role1',
                managed: false
            }],
            status: 'offline'
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.remove).toHaveBeenCalledWith(['role1'], expect.any(String));
    });
});