/*
 * Tests for the /massrole command (modules/massrole/commands/massrole.js):
 *   - beforeSubcommand: rejects members without an admin role.
 *   - checkTarget: maps the "target" option to all / bots / humans (default all).
 *   - add/remove/remove-all subcommands: defer first, then iterate members,
 *     applying the role only to the targeted subset (bots / humans / everyone),
 *     and report done vs not-done based on the failure count.
 */

const command = require('../../modules/massrole/commands/massrole');

// The string overload of embedType returns {content, allowedMentions}.
function lastEditContent(interaction) {
    const calls = interaction.editReply.mock.calls;
    const arg = calls[calls.length - 1][0];
    return typeof arg === 'string' ? arg : arg.content;
}

function makeConfig() {
    return {
        configurations: {
            massrole: {
                config: {adminRoles: ['admin']},
                strings: {
                    done: 'massrole-done',
                    notDone: 'massrole-not-done'
                }
            }
        }
    };
}

function makeMember({
                        id,
                        bot = false,
                        manageable = true,
                        addImpl,
                        removeImpl
                    } = {}) {
    return {
        id,
        user: {bot},
        manageable,
        roles: {
            cache: {filter: () => 'kept-roles'},
            add: addImpl || jest.fn().mockResolvedValue(),
            remove: removeImpl || jest.fn().mockResolvedValue()
        }
    };
}

function makeInteraction({
                             members,
                             target = null,
                             replied = false
                         } = {}) {
    const cache = new Map(members.map(m => [m.id, m]));
    return {
        replied,
        client: makeConfig(),
        user: {tag: 'Admin#0001'},
        options: {
            getString: name => (name === 'target' ? target : null),
            getRole: () => ({id: 'role1'})
        },
        guild: {
            members: {
                fetch: jest.fn().mockResolvedValue(),
                cache
            }
        },
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe('beforeSubcommand admin check', () => {
    function interactionWithRoles(roleIds) {
        const roles = roleIds.map(id => ({id}));
        return {
            client: makeConfig(),
            member: {roles: {cache: {filter: fn => ({size: roles.filter(fn).length})}}},
            reply: jest.fn().mockResolvedValue()
        };
    }

    test('rejects a member without an admin role', async () => {
        const interaction = interactionWithRoles(['member']);
        await command.beforeSubcommand(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            ephemeral: true,
            content: 'massrole.not-admin'
        }));
    });

    test('allows a member with an admin role (no reply)', async () => {
        const interaction = interactionWithRoles(['admin']);
        await command.beforeSubcommand(interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });
});

describe('checkTarget', () => {
    const make = target => ({options: {getString: () => target}});
    test('defaults to all when unset', () => {
        expect(command.checkTarget(make(null))).toBe('all');
    });
    test('maps "all"', () => expect(command.checkTarget(make('all'))).toBe('all'));
    test('maps "bots"', () => expect(command.checkTarget(make('bots'))).toBe('bots'));
    test('maps "humans"', () => expect(command.checkTarget(make('humans'))).toBe('humans'));
});

describe('add subcommand', () => {
    test('defers before applying roles and adds to every member when target=all', async () => {
        const m1 = makeMember({id: '1'});
        const m2 = makeMember({
            id: '2',
            bot: true
        });
        const interaction = makeInteraction({
            members: [m1, m2],
            target: 'all'
        });
        await command.subcommands.add(interaction);

        expect(interaction.deferReply).toHaveBeenCalledTimes(1);
        const deferOrder = interaction.deferReply.mock.invocationCallOrder[0];
        expect(m1.roles.add.mock.invocationCallOrder[0]).toBeGreaterThan(deferOrder);
        expect(m1.roles.add).toHaveBeenCalled();
        expect(m2.roles.add).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
    });

    test('target=bots only touches bot members', async () => {
        const human = makeMember({
            id: '1',
            bot: false
        });
        const bot = makeMember({
            id: '2',
            bot: true
        });
        const interaction = makeInteraction({
            members: [human, bot],
            target: 'bots'
        });
        await command.subcommands.add(interaction);
        expect(human.roles.add).not.toHaveBeenCalled();
        expect(bot.roles.add).toHaveBeenCalled();
    });

    test('target=humans skips bots and non-manageable members', async () => {
        const human = makeMember({
            id: '1',
            bot: false,
            manageable: true
        });
        const bot = makeMember({
            id: '2',
            bot: true,
            manageable: true
        });
        const unmanageable = makeMember({
            id: '3',
            bot: false,
            manageable: false
        });
        const interaction = makeInteraction({
            members: [human, bot, unmanageable],
            target: 'humans'
        });
        await command.subcommands.add(interaction);
        expect(human.roles.add).toHaveBeenCalled();
        expect(bot.roles.add).not.toHaveBeenCalled();
        expect(unmanageable.roles.add).not.toHaveBeenCalled();
    });

    test('reports not-done when a role add throws', async () => {
        const failing = makeMember({
            id: '1',
            addImpl: jest.fn().mockRejectedValue(new Error('no perms'))
        });
        const interaction = makeInteraction({
            members: [failing],
            target: 'all'
        });
        await command.subcommands.add(interaction);
        // a failed role add must surface the not-done message
        expect(lastEditContent(interaction)).toBe('massrole-not-done');
    });

    test('does nothing if the interaction was already replied', async () => {
        const m1 = makeMember({id: '1'});
        const interaction = makeInteraction({
            members: [m1],
            target: 'all',
            replied: true
        });
        await command.subcommands.add(interaction);
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(m1.roles.add).not.toHaveBeenCalled();
    });
});

describe('remove subcommand', () => {
    test('removes the role from bot members for target=bots', async () => {
        const human = makeMember({
            id: '1',
            bot: false
        });
        const bot = makeMember({
            id: '2',
            bot: true
        });
        const interaction = makeInteraction({
            members: [human, bot],
            target: 'bots'
        });
        await command.subcommands.remove(interaction);
        expect(bot.roles.remove).toHaveBeenCalled();
        expect(human.roles.remove).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
    });
});

describe('remove-all subcommand', () => {
    test('removes the filtered (non-managed) role set from each targeted member', async () => {
        const human = makeMember({
            id: '1',
            bot: false,
            manageable: true
        });
        const interaction = makeInteraction({
            members: [human],
            target: 'humans'
        });
        await command.subcommands['remove-all'](interaction);
        // first arg is the filtered cache result from member.roles.cache.filter(...)
        expect(human.roles.remove).toHaveBeenCalledWith('kept-roles', expect.any(String));
    });
});