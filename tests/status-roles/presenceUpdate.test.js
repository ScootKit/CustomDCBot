/*
 * Behavior tests for the status-roles presenceUpdate handler.
 *
 * The handler grants configured roles to members whose custom status text
 * contains a configured keyword, and removes them otherwise. Covers:
 *   - guard clauses (bot not ready, no member, wrong guild)
 *   - case-insensitive substring matching of the custom status against keywords
 *   - only Custom activities (ActivityType.Custom) are considered
 *   - not re-adding when the member already holds all roles
 *   - removing roles when the status no longer matches
 *   - the ignoreOfflineUsers option skipping removal for offline members
 */

const {ActivityType} = require('discord.js');
const handler = require('../../modules/status-roles/events/presenceUpdate');

function makeRoleCache(roleIds) {
    return {
        filter(fn) {
            return makeRoleCache(roleIds.filter(id => fn({
                id,
                managed: false
            })));
        },
        get size() {
            return roleIds.length;
        }
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
                    ignoreOfflineUsers: false,
                    ...configOverrides
                }
            }
        }
    };
}

function makePresence({
                          statusText = null,
                          memberRoles = [],
                          status = 'online',
                          guildId = 'g1',
                          hasMember = true
                      } = {}) {
    const activities = statusText === null
        ? []
        : [{
            type: ActivityType.Custom,
            state: statusText
        }];
    const member = hasMember ? {
        guild: {id: guildId},
        roles: {
            cache: makeRoleCache(memberRoles),
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue()
        }
    } : null;
    return {
        member,
        activities,
        status
    };
}

describe('status-roles guards', () => {
    test('does nothing before the bot is ready', async () => {
        const client = {
            ...makeClient(),
            botReadyAt: null
        };
        const presence = makePresence({statusText: 'scootkit'});
        await handler.run(client, null, presence);
        expect(presence.member.roles.add).not.toHaveBeenCalled();
    });

    test('does nothing when there is no member', async () => {
        const client = makeClient();
        const presence = makePresence({hasMember: true});
        presence.member = null;
        await expect(handler.run(client, null, presence)).resolves.toBeUndefined();
    });

    test('ignores presences from other guilds', async () => {
        const client = makeClient();
        const presence = makePresence({
            statusText: 'scootkit',
            guildId: 'other'
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.add).not.toHaveBeenCalled();
    });
});

describe('status matching', () => {
    test('adds the configured roles when the status contains a keyword (case-insensitive)', async () => {
        const client = makeClient();
        const presence = makePresence({statusText: 'I love ScootKit servers'});
        await handler.run(client, null, presence);
        expect(presence.member.roles.add).toHaveBeenCalledWith(['role1'], expect.any(String));
    });

    test('does not re-add when the member already has all roles', async () => {
        const client = makeClient();
        const presence = makePresence({
            statusText: 'scootkit',
            memberRoles: ['role1']
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.add).not.toHaveBeenCalled();
    });

    test('ignores non-custom activities', async () => {
        const client = makeClient();
        const presence = makePresence({statusText: 'scootkit'});
        // Make the only activity a non-custom one.
        presence.activities = [{
            type: ActivityType.Playing,
            state: 'scootkit'
        }];
        await handler.run(client, null, presence);
        expect(presence.member.roles.add).not.toHaveBeenCalled();
    });

    test('removes the roles when the status no longer matches', async () => {
        const client = makeClient();
        const presence = makePresence({
            statusText: 'unrelated',
            memberRoles: ['role1']
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.remove).toHaveBeenCalledWith(['role1'], expect.any(String));
    });

    test('does not attempt removal when the member has none of the roles', async () => {
        const client = makeClient();
        const presence = makePresence({
            statusText: 'unrelated',
            memberRoles: []
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.remove).not.toHaveBeenCalled();
    });

    test('skips removal for offline members when ignoreOfflineUsers is set', async () => {
        const client = makeClient({ignoreOfflineUsers: true});
        const presence = makePresence({
            statusText: 'unrelated',
            memberRoles: ['role1'],
            status: 'offline'
        });
        await handler.run(client, null, presence);
        expect(presence.member.roles.remove).not.toHaveBeenCalled();
    });
});