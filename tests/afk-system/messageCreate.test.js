/*
 * Behavioural tests for afk-system messageCreate.run.
 * Covers: auto-ending the author's own AFK session on activity, replying with
 * the configured AFK notice when mentioning an AFK user (with/without reason),
 * skipping self-mentions, and the early-return guards (not ready, wrong guild,
 * prefix commands, bot authors).
 */
const handler = require('../../modules/afk-system/events/messageCreate');

function makeAFKUser(overrides = {}) {
    return Object.assign({
        afkMessage: null,
        autoEnd: true,
        destroy: jest.fn().mockResolvedValue()
    }, overrides);
}

function makeClient({
                        authorAFK = null,
                        mentionAFK = {}
                    } = {}) {
    const AFKUser = {
        findOne: jest.fn().mockImplementation(async ({where}) => {
            if (where.autoEnd === true) return authorAFK;
            return mentionAFK[where.userID] || null;
        })
    };
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        config: {prefix: '!'},
        configurations: {
            'afk-system': {
                config: {
                    autoEndMessage: 'welcome back %user%',
                    afkUserWithReason: '%user% is afk: %reason%',
                    afkUserWithoutReason: '%user% is afk'
                }
            }
        },
        models: {'afk-system': {AFKUser}},
        nicknameManager: {
            attachMember: jest.fn(),
            requestUpdate: jest.fn()
        }
    };
}

function makeMessage({
                         content = 'hi',
                         mentions = []
                     } = {}) {
    return {
        guild: {id: 'g1'},
        author: {
            id: 'u1',
            bot: false,
            toString: () => '<@u1>'
        },
        member: {id: 'u1'},
        content,
        mentions: {members: {values: () => mentions.values ? mentions.values() : mentions}},
        reply: jest.fn().mockResolvedValue()
    };
}

function mentionMember(id) {
    return {
        id,
        toString: () => `<@${id}>`
    };
}

test('auto-ends the author\'s AFK session and notifies them', async () => {
    const authorAFK = makeAFKUser({autoEnd: true});
    const client = makeClient({authorAFK});
    const msg = makeMessage();
    await handler.run(client, msg);
    expect(authorAFK.destroy).toHaveBeenCalled();
    expect(client.nicknameManager.requestUpdate).toHaveBeenCalledWith('u1');
    expect(msg.reply).toHaveBeenCalled();
});

test('replies with the with-reason notice when mentioning an AFK user', async () => {
    const target = mentionMember('u2');
    const client = makeClient({mentionAFK: {u2: makeAFKUser({afkMessage: 'lunch'})}});
    const msg = makeMessage({mentions: [target]});
    await handler.run(client, msg);
    const arg = msg.reply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toContain('lunch');
});

test('replies with the no-reason notice when the AFK user has no message', async () => {
    const target = mentionMember('u2');
    const client = makeClient({mentionAFK: {u2: makeAFKUser({afkMessage: null})}});
    const msg = makeMessage({mentions: [target]});
    await handler.run(client, msg);
    expect(msg.reply).toHaveBeenCalledTimes(1);
});

test('does not reply for a mention that is not AFK', async () => {
    const client = makeClient({mentionAFK: {}});
    const msg = makeMessage({mentions: [mentionMember('u2')]});
    await handler.run(client, msg);
    expect(msg.reply).not.toHaveBeenCalled();
});

test('skips a self-mention', async () => {
    const client = makeClient({mentionAFK: {u1: makeAFKUser()}});
    const msg = makeMessage({mentions: [mentionMember('u1')]});
    await handler.run(client, msg);
    expect(msg.reply).not.toHaveBeenCalled();
});

describe('guards', () => {
    test('ignores messages when not ready', async () => {
        const client = makeClient();
        client.botReadyAt = null;
        const msg = makeMessage();
        await handler.run(client, msg);
        expect(client.models['afk-system'].AFKUser.findOne).not.toHaveBeenCalled();
    });
    test('ignores prefixed command messages', async () => {
        const client = makeClient();
        const msg = makeMessage({content: '!ping'});
        await handler.run(client, msg);
        expect(client.models['afk-system'].AFKUser.findOne).not.toHaveBeenCalled();
    });
    test('ignores messages from other guilds', async () => {
        const client = makeClient();
        const msg = makeMessage();
        msg.guild.id = 'other';
        await handler.run(client, msg);
        expect(client.models['afk-system'].AFKUser.findOne).not.toHaveBeenCalled();
    });
    test('ignores bot authors', async () => {
        const client = makeClient();
        const msg = makeMessage();
        msg.author.bot = true;
        await handler.run(client, msg);
        expect(client.models['afk-system'].AFKUser.findOne).not.toHaveBeenCalled();
    });
});