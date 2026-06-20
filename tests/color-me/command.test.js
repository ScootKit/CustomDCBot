/*
 * Covers modules/color-me/commands/color-me.js orchestration beyond colour
 * validation:
 *  - beforeSubcommand defers the reply ephemerally
 *  - the remove subcommand: deletes the user's colour role when it exists and
 *    replies; stays quiet when no record / role is gone
 * The heavy "manage" subcommand depends on the shared main-stub client and live
 * cooldown DB access; here we focus on the standalone, deterministic paths.
 * embedType is the real helper; localize/main auto-stubbed.
 */
const cmd = require('../../modules/color-me/commands/color-me');

const strings = {removed: 'removed!'};

function makeModel(found) {
    return {findOne: jest.fn().mockResolvedValue(found)};
}

function makeInteraction({
                             found,
                             roleExists = true,
                             role
                         } = {}) {
    const resolvedRole = role || {delete: jest.fn()};
    return {
        member: {
            id: 'm1',
            user: {username: 'alice'}
        },
        guild: {
            roles: {
                cache: {find: () => (roleExists ? resolvedRole : undefined)},
                resolve: () => resolvedRole
            }
        },
        client: {
            configurations: {'color-me': {strings}},
            models: {'color-me': {Role: makeModel(found)}}
        },
        editReply: jest.fn().mockResolvedValue()
    };
}

describe('beforeSubcommand', () => {
    test('defers the reply ephemerally', async () => {
        const interaction = {deferReply: jest.fn().mockResolvedValue()};
        await cmd.beforeSubcommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
    });
});

describe('remove subcommand', () => {
    test('deletes the colour role and replies when it exists', async () => {
        const role = {delete: jest.fn()};
        const interaction = makeInteraction({
            found: {roleID: 'r1'},
            roleExists: true,
            role
        });
        await cmd.subcommands.remove(interaction);
        expect(role.delete).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
    });

    test('does nothing when the user has no stored role record', async () => {
        const interaction = makeInteraction({found: null});
        await cmd.subcommands.remove(interaction);
        expect(interaction.editReply).not.toHaveBeenCalled();
    });

    test('does not reply when the stored role no longer exists in the guild', async () => {
        const interaction = makeInteraction({
            found: {roleID: 'gone'},
            roleExists: false
        });
        await cmd.subcommands.remove(interaction);
        expect(interaction.editReply).not.toHaveBeenCalled();
    });
});

test('exposes the color-me slash command config with manage + remove', () => {
    expect(cmd.config.name).toBe('color-me');
    const subs = cmd.config.options.map(o => o.name);
    expect(subs).toEqual(['manage', 'remove']);
});