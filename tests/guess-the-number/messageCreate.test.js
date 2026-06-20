/*
 * Behavioural tests for the guess-the-number messageCreate handler. Covers the
 * guess-evaluation branches: invalid (non-numeric / out-of-range) guesses get a
 * 🚫 reaction, wrong guesses get higher/lower arrows or ❌, a correct guess gets
 * ✅, ends the game, records the winner and leaderboard stats. Also verifies the
 * early-return guards (not ready, bot author, no active game).
 */
jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((x) => ({content: x})),
    lockChannel: jest.fn().mockResolvedValue(),
    randomIntFromInterval: jest.fn(() => 7)
}));
jest.mock('../../modules/guess-the-number/guessTheNumber', () => ({startGame: jest.fn().mockResolvedValue()}));

const handler = require('../../modules/guess-the-number/events/messageCreate');

function makeRoleCache(roleIds = []) {
    const cache = new Map(roleIds.map(id => [id, {
        id,
        client: null
    }]));
    cache.filter = (fn) => {
        const out = [...cache.values()].filter(fn);
        return {size: out.length};
    };
    return cache;
}

function makeConfig(overrides = {}) {
    return {
        config: {
            adminRoles: [],
            enableLeaderboard: false,
            higherLowerReactions: false,
            endMessage: 'END',
            ...(overrides.config || {})
        },
        channel: {
            enabled: false,
            channel: 'gamechannel',
            minInt: 1,
            maxInt: 10, ...(overrides.channel || {})
        }
    };
}

function makeGame(overrides = {}) {
    return {
        min: 1,
        max: 100,
        number: 50,
        guessCount: 0,
        ended: false,
        save: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

function makeClient({
                        game,
                        config = makeConfig(),
                        userStats
                    } = {}) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        configurations: {'guess-the-number': config},
        models: {
            'guess-the-number': {
                Channel: {findOne: jest.fn().mockResolvedValue(game)},
                User: {
                    findOrCreate: jest.fn().mockResolvedValue([
                        userStats || {
                            wins: 0,
                            totalGuesses: 0,
                            save: jest.fn().mockResolvedValue()
                        }
                    ])
                }
            }
        }
    };
}

function makeMsg({
                     content,
                     roleIds = [],
                     channelId = 'chan'
                 } = {}) {
    const roleCache = makeRoleCache(roleIds);
    // role objects need client.configurations for the admin-role filter
    return {
        author: {
            bot: false,
            id: 'user1',
            toString: () => '<@user1>'
        },
        guild: {id: 'g1'},
        channel: {id: channelId},
        content,
        member: {roles: {cache: roleCache}},
        react: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

test('ignores messages before the bot is ready', async () => {
    const client = makeClient({game: makeGame()});
    client.botReadyAt = null;
    const msg = makeMsg({content: '50'});
    await handler.run(client, msg);
    expect(client.models['guess-the-number'].Channel.findOne).not.toHaveBeenCalled();
});

test('ignores bot authors and messages with no active game', async () => {
    const botMsg = makeMsg({content: '50'});
    botMsg.author.bot = true;
    await handler.run(makeClient({game: makeGame()}), botMsg);
    expect(botMsg.react).not.toHaveBeenCalled();

    const noGameClient = makeClient({game: null});
    const msg = makeMsg({content: '50'});
    await handler.run(noGameClient, msg);
    expect(msg.react).not.toHaveBeenCalled();
});

test('reacts 🚫 to a non-numeric guess', async () => {
    const client = makeClient({game: makeGame()});
    const msg = makeMsg({content: 'hello'});
    await handler.run(client, msg);
    expect(msg.react).toHaveBeenCalledWith('🚫');
});

test('reacts 🚫 to a guess outside the configured range', async () => {
    const client = makeClient({
        game: makeGame({
            min: 1,
            max: 10
        })
    });
    const msg = makeMsg({content: '999'});
    await handler.run(client, msg);
    expect(msg.react).toHaveBeenCalledWith('🚫');
});

test('a wrong guess (no higher/lower) reacts ❌ and increments guessCount', async () => {
    const game = makeGame({
        number: 50,
        guessCount: 4
    });
    const client = makeClient({game});
    const msg = makeMsg({content: '40'});
    await handler.run(client, msg);
    expect(game.guessCount).toBe(5);
    expect(game.save).toHaveBeenCalled();
    expect(msg.react).toHaveBeenCalledWith('❌');
    expect(game.ended).toBe(false);
});

test('higher/lower mode points down when the secret is below the guess', async () => {
    const game = makeGame({number: 20});
    const client = makeClient({
        game,
        config: makeConfig({config: {higherLowerReactions: true}})
    });
    const msg = makeMsg({content: '80'}); // guess too high -> arrow down
    await handler.run(client, msg);
    expect(msg.react).toHaveBeenCalledWith('⬇');
});

test('higher/lower mode points up when the secret is above the guess', async () => {
    const game = makeGame({number: 90});
    const client = makeClient({
        game,
        config: makeConfig({config: {higherLowerReactions: true}})
    });
    const msg = makeMsg({content: '10'}); // guess too low -> arrow up
    await handler.run(client, msg);
    expect(msg.react).toHaveBeenCalledWith('⬆');
});

test('a correct guess reacts ✅, ends the game and records the winner', async () => {
    const game = makeGame({
        number: 42,
        guessCount: 9
    });
    const client = makeClient({game});
    const msg = makeMsg({content: '42'});
    await handler.run(client, msg);
    expect(msg.react).toHaveBeenCalledWith('✅');
    expect(game.ended).toBe(true);
    expect(game.winnerID).toBe('user1');
    expect(msg.reply).toHaveBeenCalled();
});

test('a correct guess updates leaderboard win/guess stats when enabled', async () => {
    const game = makeGame({number: 42});
    const userStats = {
        wins: 0,
        totalGuesses: 3,
        save: jest.fn().mockResolvedValue()
    };
    const client = makeClient({
        game,
        config: makeConfig({config: {enableLeaderboard: true}}),
        userStats
    });
    const msg = makeMsg({content: '42'});
    await handler.run(client, msg);
    // findOrCreate called for the guess and again for the win
    expect(client.models['guess-the-number'].User.findOrCreate).toHaveBeenCalledTimes(2);
    expect(userStats.totalGuesses).toBe(4);
    expect(userStats.wins).toBe(1);
});