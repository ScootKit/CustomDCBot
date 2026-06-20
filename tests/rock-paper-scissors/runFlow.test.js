/*
 * Tests for the rock-paper-scissors command run() orchestration and its
 * component collector, complementing gameLogic.test.js (which only covered the
 * pure helpers).
 *
 * Covered:
 *   - challenging the bot: no human confirmation is requested, the board is
 *     posted immediately, a game is registered under the message id with the bot
 *     pre-"selected", and a button collector is created
 *   - challenging another human: a confirmation prompt is shown; an expired
 *     confirmation edits the "invite expired" message; a "deny" edits the
 *     "invite denied" message
 *   - the collector's "collect" handler: a "play again" press resets the game and
 *     a human picking against the bot resolves a round and renders the result
 *   - the collector's "end" handler removes the game from the registry
 *
 * Math.random is stubbed so the bot's pick is deterministic.
 */

const rps = require('../../modules/rock-paper-scissors/commands/rock-paper-scissors');
const [STONE] = rps._moves;

function makeCollector() {
    const handlers = {};
    return {
        on: jest.fn((event, cb) => {
            handlers[event] = cb;
        }),
        _handlers: handlers
    };
}

function makeMessage(id = 'game-msg') {
    const collector = makeCollector();
    return {
        id,
        collector,
        update: jest.fn().mockResolvedValue(),
        createMessageComponentCollector: jest.fn(() => collector),
        awaitMessageComponent: jest.fn()
    };
}

function makeInteraction({
                             member = null,
                             replyMsg
                         } = {}) {
    return {
        user: {
            id: 'p1',
            toString: () => '<@p1>',
            bot: false,
            tag: 'P1#1',
            username: 'P1',
            discriminator: '1'
        },
        client: {
            user: {
                id: 'bot',
                toString: () => '<@bot>',
                bot: true,
                tag: 'Bot#1',
                username: 'Bot',
                discriminator: '0'
            }
        },
        options: {getMember: jest.fn(() => member)},
        reply: jest.fn().mockResolvedValue(replyMsg),
        update: jest.fn().mockResolvedValue(replyMsg)
    };
}

afterEach(() => {
    // clear the shared games registry between tests
    for (const k of Object.keys(rps._rpsgames)) delete rps._rpsgames[k];
    jest.restoreAllMocks();
});

describe('rps run() against the bot', () => {
    test('posts the board immediately and registers the game with the bot pre-selected', async () => {
        const msg = makeMessage('m-bot');
        const interaction = makeInteraction({
            member: null,
            replyMsg: msg
        });
        await rps.run(interaction);
        // no human confirmation requested
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        expect(rps._rpsgames['m-bot']).toBeTruthy();
        expect(rps._rpsgames['m-bot'].state2).toBe('selected'); // bot is pre-selected
        expect(msg.createMessageComponentCollector).toHaveBeenCalledTimes(1);
    });

    test('end handler removes the game from the registry', async () => {
        const msg = makeMessage('m-end');
        const interaction = makeInteraction({
            member: null,
            replyMsg: msg
        });
        await rps.run(interaction);
        expect(rps._rpsgames['m-end']).toBeTruthy();
        msg.collector._handlers.end();
        expect(rps._rpsgames['m-end']).toBeUndefined();
    });

    test('collect: play-again resets the game state', async () => {
        const msg = makeMessage('m-again');
        const interaction = makeInteraction({
            member: null,
            replyMsg: msg
        });
        await rps.run(interaction);
        const game = rps._rpsgames['m-again'];
        game.state1 = 'selected';
        game.selected1 = 'rps_stone';
        const press = {
            customId: 'rps_playagain',
            user: {id: 'p1'},
            message: {id: 'm-again'},
            update: jest.fn().mockResolvedValue()
        };
        await msg.collector._handlers.collect(press);
        expect(press.update).toHaveBeenCalledTimes(1);
        expect(game.state1).toBe('none');
        expect(game.selected1).toBeUndefined();
    });

    test('collect: a human pick vs the bot resolves the round', async () => {
        jest.spyOn(Math, 'random').mockReturnValue(0); // bot always picks moves[0] (stone)
        const msg = makeMessage('m-play');
        const interaction = makeInteraction({
            member: null,
            replyMsg: msg
        });
        await rps.run(interaction);
        const press = {
            customId: 'rps_stone',
            user: {id: 'p1'},
            message: {id: 'm-play'},
            update: jest.fn().mockResolvedValue()
        };
        await msg.collector._handlers.collect(press);
        // both picked stone -> a tie; update is called to render the result
        expect(press.update).toHaveBeenCalled();
        const game = rps._rpsgames['m-play'];
        // tie resets the game (both back to a fresh round; bot re-selected)
        expect(game.state2).toBe('selected');
    });
});

describe('rps run() against another human', () => {
    function humanMember() {
        return {
            id: 'p2',
            toString: () => '<@p2>',
            user: {
                id: 'p2',
                bot: false,
                tag: 'P2#1',
                username: 'P2',
                discriminator: '2'
            }
        };
    }

    test('edits the "invite expired" message when the confirmation times out', async () => {
        const confirmMsg = {
            update: jest.fn().mockResolvedValue(),
            awaitMessageComponent: jest.fn().mockResolvedValue(undefined) // timed out
        };
        const interaction = makeInteraction({
            member: humanMember(),
            replyMsg: confirmMsg
        });
        await rps.run(interaction);
        expect(confirmMsg.update).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('invite-expired')
        }));
    });

    test('edits the "invite denied" message when the opponent denies', async () => {
        const denied = {
            customId: 'deny-invite',
            update: jest.fn().mockResolvedValue()
        };
        const confirmMsg = {
            update: jest.fn().mockResolvedValue(),
            awaitMessageComponent: jest.fn().mockResolvedValue(denied)
        };
        const interaction = makeInteraction({
            member: humanMember(),
            replyMsg: confirmMsg
        });
        await rps.run(interaction);
        expect(denied.update).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('invite-denied')
        }));
    });
});