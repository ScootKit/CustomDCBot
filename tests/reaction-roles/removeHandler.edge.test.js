/*
 * Additional edge-case coverage for the reaction-roles REMOVE handler, which the
 * existing reactionHandlers.test.js touches only lightly. Focuses on the guard
 * chain that differs from / is shared with the add handler: botReady guard,
 * partial fetch, cross-guild guard, and unmapped-emoji guard.
 */
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
                          guildId = 'g1',
                          member = makeMember()
                      } = {}) {
    return {
        partial: false,
        _emoji: {toString: () => emoji},
        message: {
            id: messageID,
            guildId,
            guild: {members: {fetch: jest.fn().mockResolvedValue(member)}}
        }
    };
}

const config = [{
    messageID: 'msg1',
    reactions: {
        '👍': 'r1,r2',
        '🔥': 'r3'
    }
}];

test('ignores removals before the bot is ready', async () => {
    const client = makeClient(config);
    client.botReadyAt = undefined;
    const member = makeMember();
    const reaction = makeReaction({member});
    await removeHandler.run(client, reaction, {id: 'u1'});
    expect(reaction.message.guild.members.fetch).not.toHaveBeenCalled();
    expect(member.roles.remove).not.toHaveBeenCalled();
});

test('fetches a partial reaction before processing the removal', async () => {
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
    await removeHandler.run(client, partial, {id: 'u1'});
    expect(partial.fetch).toHaveBeenCalled();
    expect(member.roles.remove).toHaveBeenCalledWith(['r3']);
});

test('ignores removals from a different guild', async () => {
    const client = makeClient(config);
    const member = makeMember();
    const reaction = makeReaction({
        guildId: 'elsewhere',
        member
    });
    await removeHandler.run(client, reaction, {id: 'u1'});
    expect(member.roles.remove).not.toHaveBeenCalled();
});

test('does nothing for an emoji with no role mapping', async () => {
    const client = makeClient(config);
    const member = makeMember();
    const reaction = makeReaction({
        emoji: '🚫',
        member
    });
    await removeHandler.run(client, reaction, {id: 'u1'});
    expect(member.roles.remove).not.toHaveBeenCalled();
});

test('removes a single role when the mapping has no comma', async () => {
    const client = makeClient(config);
    const member = makeMember();
    const reaction = makeReaction({
        emoji: '🔥',
        member
    });
    await removeHandler.run(client, reaction, {id: 'u1'});
    expect(member.roles.remove).toHaveBeenCalledWith(['r3']);
});

test('exposes allowPartial = true', () => {
    expect(removeHandler.allowPartial).toBe(true);
});