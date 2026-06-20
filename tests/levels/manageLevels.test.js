/*
 * Tests for the /manage-levels subcommands (modules/levels/commands/
 * manage-levels.js). Covers:
 *   - reset-xp: the confirm guard, user reset (and user-not-found), full server
 *     reset, and log-channel notification.
 *   - edit-xp set/add/remove via runXPAction: creates a missing user, the
 *     negative-xp and out-of-range guards, the level-up loop, and the success
 *     reply / logging.
 *   - edit-level set/add via runLevelAction: no-profile guard, negative-level
 *     guard, role reconciliation through fixLevelRoles (reward + onlyTopLevel
 *     removal), and startFromZero offset.
 * Uses the LINEAR curve (xp = level*750) so level thresholds are predictable.
 */
jest.mock('../../src/functions/helpers', () => ({
    formatDiscordUserName: (u) => u.username,
    formatNumber: (n) => String(n)
}));
jest.mock('../../modules/levels/leaderboardChannel', () => ({registerNeededEdit: jest.fn()}));

const command = require('../../modules/levels/commands/manage-levels');

function baseConfig(overrides = {}) {
    return {
        curveType: 'LINEAR',
        startFromZero: false,
        reward_roles: {},
        onlyTopLevelRole: false,
        ...overrides
    };
}

function makeMember(roleIds = []) {
    const cache = new Map(roleIds.map(id => [id, {id}]));
    cache.has = (id) => [...cache.keys()].includes(id);
    return {
        user: {
            id: 'target',
            username: 'Target',
            toString: () => '<@target>'
        },
        roles: {
            cache,
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue()
        }
    };
}

function makeInteraction({
                             options = {},
                             member,
                             user = null,
                             allUsers,
                             config = {},
                             logChannel
                         } = {}) {
    const User = {
        findOne: jest.fn().mockResolvedValue(user),
        create: jest.fn(async (vals) => ({
            ...vals,
            level: 1,
            save: jest.fn()
        })),
        findAll: jest.fn().mockResolvedValue(allUsers || [])
    };
    return {
        user: {
            id: 'admin',
            username: 'Admin'
        },
        options: {
            getUser: (k) => options[`user:${k}`] ?? options.user ?? null,
            getMember: () => member,
            getBoolean: (k) => options[`bool:${k}`] ?? null,
            getNumber: () => options.value
        },
        client: {
            configurations: {levels: {config: baseConfig(config)}},
            models: {levels: {User}},
            logger: {info: jest.fn()},
            logChannel
        },
        reply: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue()
    };
}

describe('reset-xp', () => {
    test('asks for confirmation when confirm is not set (server scope)', async () => {
        const interaction = makeInteraction({
            options: {
                user: null,
                'bool:confirm': false
            }
        });
        await command.subcommands['reset-xp'](interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('are-you-sure-you-want-to-delete-server-xp');
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    test('user scope: destroys the target row and confirms', async () => {
        const target = {
            id: 'target',
            toString: () => '<@target>'
        };
        const row = {
            userID: 'target',
            destroy: jest.fn().mockResolvedValue()
        };
        const interaction = makeInteraction({
            options: {
                user: target,
                'bool:confirm': true
            },
            user: row
        });
        await command.subcommands['reset-xp'](interaction);
        expect(row.destroy).toHaveBeenCalled();
        expect(interaction.editReply.mock.calls[0][0]).toContain('removed-xp-successfully');
    });

    test('user scope: reports user-not-found when no row exists', async () => {
        const target = {
            id: 'target',
            toString: () => '<@target>'
        };
        const interaction = makeInteraction({
            options: {
                user: target,
                'bool:confirm': true
            },
            user: null
        });
        await command.subcommands['reset-xp'](interaction);
        expect(interaction.editReply.mock.calls[0][0]).toContain('user-not-found');
    });

    test('server scope: destroys every row and notifies the log channel', async () => {
        const rows = [{destroy: jest.fn().mockResolvedValue()}, {destroy: jest.fn().mockResolvedValue()}];
        const logChannel = {send: jest.fn().mockResolvedValue()};
        const interaction = makeInteraction({
            options: {
                user: null,
                'bool:confirm': true
            },
            allUsers: rows,
            logChannel
        });
        await command.subcommands['reset-xp'](interaction);
        expect(rows[0].destroy).toHaveBeenCalled();
        expect(rows[1].destroy).toHaveBeenCalled();
        expect(logChannel.send).toHaveBeenCalled();
        expect(interaction.editReply.mock.calls[0][0]).toContain('successfully-deleted-all-xp-of-users');
    });
});

describe('edit-xp', () => {
    test('set creates a missing user then applies the absolute value', async () => {
        const member = makeMember();
        const interaction = makeInteraction({
            member,
            options: {value: 800},
            user: null
        });
        await command.subcommands['edit-xp'].set(interaction);
        expect(interaction.client.models.levels.User.create).toHaveBeenCalled();
        // 800 xp -> at least level 2 under LINEAR (level*750)
        expect(interaction.editReply.mock.calls[0][0].content).toContain('successfully-changed');
    });

    test('rejects a negative resulting xp', async () => {
        const member = makeMember();
        const user = {
            userID: 'target',
            xp: 100,
            level: 1,
            save: jest.fn()
        };
        const interaction = makeInteraction({
            member,
            options: {value: -500},
            user
        });
        await command.subcommands['edit-xp'].add(interaction);
        expect(interaction.editReply.mock.calls[0][0].content).toContain('negative-xp');
        expect(user.save).not.toHaveBeenCalled();
    });

    test('rejects xp above the safety ceiling', async () => {
        const member = makeMember();
        const user = {
            userID: 'target',
            xp: 0,
            level: 1,
            save: jest.fn()
        };
        const interaction = makeInteraction({
            member,
            options: {value: 2e12},
            user
        });
        await command.subcommands['edit-xp'].set(interaction);
        expect(interaction.editReply.mock.calls[0][0].content).toContain('xp-out-of-range');
    });

    test('add raises the level via the threshold loop and saves', async () => {
        const member = makeMember();
        const user = {
            userID: 'target',
            xp: 0,
            level: 1,
            save: jest.fn().mockResolvedValue()
        };
        // +3000 xp under LINEAR: level 4 needs 3000.
        const interaction = makeInteraction({
            member,
            options: {value: 3000},
            user
        });
        await command.subcommands['edit-xp'].add(interaction);
        expect(user.level).toBeGreaterThan(1);
        expect(user.save).toHaveBeenCalled();
    });
});

describe('edit-level', () => {
    test('reports no-profile when the target has no row', async () => {
        const member = makeMember();
        const interaction = makeInteraction({
            member,
            options: {value: 5},
            user: null
        });
        await command.subcommands['edit-level'].set(interaction);
        expect(interaction.editReply.mock.calls[0][0].content).toContain('cheat-no-profile');
    });

    test('rejects a resulting level below 1', async () => {
        const member = makeMember();
        const user = {
            userID: 'target',
            level: 2,
            xp: 1500,
            save: jest.fn()
        };
        const interaction = makeInteraction({
            member,
            options: {value: 0},
            user
        });
        await command.subcommands['edit-level'].set(interaction);
        expect(interaction.editReply.mock.calls[0][0].content).toContain('negative-level');
    });

    test('set recomputes xp for the new level and reconciles reward roles', async () => {
        const member = makeMember();
        const user = {
            userID: 'target',
            level: 1,
            xp: 750,
            save: jest.fn().mockResolvedValue()
        };
        const interaction = makeInteraction({
            member,
            options: {value: 3},
            user,
            config: {
                reward_roles: {
                    '2': 'roleTwo',
                    '3': 'roleThree'
                }
            }
        });
        await command.subcommands['edit-level'].set(interaction);
        expect(user.level).toBe(3);
        expect(user.xp).toBe(2250); // 3*750 LINEAR
        // both reward roles at/under level 3 added
        expect(member.roles.add).toHaveBeenCalledWith('roleTwo', expect.any(String));
        expect(member.roles.add).toHaveBeenCalledWith('roleThree', expect.any(String));
    });

    test('onlyTopLevelRole removes the lower reward when climbing past it', async () => {
        const member = makeMember(['roleTwo']);
        const user = {
            userID: 'target',
            level: 1,
            xp: 750,
            save: jest.fn().mockResolvedValue()
        };
        const interaction = makeInteraction({
            member,
            options: {value: 3},
            user,
            config: {
                onlyTopLevelRole: true,
                reward_roles: {
                    '2': 'roleTwo',
                    '3': 'roleThree'
                }
            }
        });
        await command.subcommands['edit-level'].set(interaction);
        expect(member.roles.remove).toHaveBeenCalledWith('roleTwo', expect.any(String));
        expect(member.roles.add).toHaveBeenCalledWith('roleThree', expect.any(String));
    });

    test('startFromZero offsets a non-zero new level by one', async () => {
        const member = makeMember();
        const user = {
            userID: 'target',
            level: 2,
            xp: 1500,
            save: jest.fn().mockResolvedValue()
        };
        const interaction = makeInteraction({
            member,
            options: {value: 5},
            user,
            config: {startFromZero: true}
        });
        await command.subcommands['edit-level'].set(interaction);
        expect(user.level).toBe(6); // 5 + 1 offset
    });
});