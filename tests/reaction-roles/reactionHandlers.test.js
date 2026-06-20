/*
 * Tests for the reaction-roles add/remove event handlers.
 *
 * Both handlers share the same guard chain and config lookup:
 *   - ignore reactions before the bot is ready
 *   - fetch partial reactions
 *   - ignore reactions from other guilds
 *   - (add only) ignore the bot's own reaction
 *   - find the configured message, then the role mapping for the emoji
 *   - add/remove the comma-separated role list to the reacting member
 * The add handler additionally re-reacts so the emoji stays clickable.
 */

const addHandler = require('../../modules/reaction-roles/events/messageReactionAdd');
const removeHandler = require('../../modules/reaction-roles/events/messageReactionRemove');

function makeMember() {
    return {
        roles: {
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue()
        }
    };
}

function makeClient(messages) {
    return {
        botReadyAt: Date.now(),
        guild: {id: 'g1'},
        user: {id: 'bot1'},
        configurations: {'reaction-roles': {messages}}
    };
}

function makeReaction({
                          emoji = '👍',
                          messageID = 'msg1',
                          member = makeMember()
                      } = {}) {
    return {
        partial: false,
        _emoji: {toString: () => emoji},
        message: {
            id: messageID,
            guildId: 'g1',
            react: jest.fn().mockResolvedValue(),
            guild: {
                members: {fetch: jest.fn().mockResolvedValue(member)}
            }
        }
    };
}

const config = [{
    messageID: 'msg1',
    reactions: {
        '👍': 'role-a,role-b',
        '🔥': 'role-c'
    }
}];

describe('reaction-roles add handler', () => {
    test('adds the comma-split roles for a matching emoji', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({
            emoji: '👍',
            member
        });
        await addHandler.run(client, reaction, {id: 'user1'});
        expect(member.roles.add).toHaveBeenCalledWith(['role-a', 'role-b']);
        // re-reacts to keep the emoji available
        expect(reaction.message.react).toHaveBeenCalledWith('👍');
    });

    test('ignores reactions before the bot is ready', async () => {
        const client = makeClient(config);
        client.botReadyAt = undefined;
        const member = makeMember();
        const reaction = makeReaction({member});
        await addHandler.run(client, reaction, {id: 'user1'});
        expect(reaction.message.guild.members.fetch).not.toHaveBeenCalled();
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('ignores the bot\'s own reaction', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({member});
        await addHandler.run(client, reaction, {id: 'bot1'});
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('ignores reactions from a different guild', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({member});
        reaction.message.guildId = 'other-guild';
        await addHandler.run(client, reaction, {id: 'user1'});
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('does nothing for an unconfigured message', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({
            messageID: 'unknown',
            member
        });
        await addHandler.run(client, reaction, {id: 'user1'});
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('does nothing for an emoji with no role mapping', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({
            emoji: '🚫',
            member
        });
        await addHandler.run(client, reaction, {id: 'user1'});
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('fetches a partial reaction before processing', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const real = makeReaction({
            emoji: '🔥',
            member
        });
        const partial = {
            partial: true,
            fetch: jest.fn().mockResolvedValue(real)
        };
        await addHandler.run(client, partial, {id: 'user1'});
        expect(partial.fetch).toHaveBeenCalled();
        expect(member.roles.add).toHaveBeenCalledWith(['role-c']);
    });
});

describe('reaction-roles remove handler', () => {
    test('removes the comma-split roles for a matching emoji', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({
            emoji: '👍',
            member
        });
        await removeHandler.run(client, reaction, {id: 'user1'});
        expect(member.roles.remove).toHaveBeenCalledWith(['role-a', 'role-b']);
    });

    test('does not re-react when removing', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({
            emoji: '👍',
            member
        });
        await removeHandler.run(client, reaction, {id: 'user1'});
        expect(reaction.message.react).not.toHaveBeenCalled();
    });

    test('processes the bot\'s own removal (no self-skip on remove)', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({
            emoji: '🔥',
            member
        });
        await removeHandler.run(client, reaction, {id: 'bot1'});
        expect(member.roles.remove).toHaveBeenCalledWith(['role-c']);
    });

    test('does nothing for an unconfigured message', async () => {
        const client = makeClient(config);
        const member = makeMember();
        const reaction = makeReaction({
            messageID: 'unknown',
            member
        });
        await removeHandler.run(client, reaction, {id: 'user1'});
        expect(member.roles.remove).not.toHaveBeenCalled();
    });
});