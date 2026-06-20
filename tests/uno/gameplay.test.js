/*
 * Gameplay tests for UNO, complementing the pure-rule tests in gameRules.test.js.
 *
 * Covers gameMsg (player roster + turn line + pending-draws warning), buildDeck
 * (per-card playability styling / disabling and the draw vs update control button),
 * perPlayerHandler core branches (off-turn guard, the uno-update refresh, drawing a
 * card, playing a valid/invalid card, winning by emptying the hand, the "missing
 * uno" penalty, reverse flipping direction, choosing a wild colour), nextPlayer's
 * inactivity timers, and the run() lobby (join / not-host / host-start / uno button).
 *
 * Localize stub yields "<ns>.<key>" so card-name constants are e.g. "uno.skip".
 */
const uno = require('../../modules/uno/commands/uno');
const {
    gameMsg,
    buildDeck,
    perPlayerHandler,
    nextPlayer,
    colorEmojis
} = uno.__test;

const REVERSE = 'uno.reverse';
const SKIP = 'uno.skip';
const WILD = 'uno.color';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

function makePlayer(id, n, cards, extra = {}) {
    return {
        id,
        n,
        cards,
        uno: false,
        turn: false,
        blockRedraw: false, ...extra
    };
}

function makeGame(players, lastCard = {
    name: '5',
    color: 'red'
}, extra = {}) {
    return {
        players,
        lastCard,
        previousCards: [],
        inactiveTimeout: [],
        turns: 0,
        reversed: false,
        justChoosingColor: false,
        pendingDraws: 0,
        msg: {
            id: 'm',
            channel: {
                id: 'c',
                send: jest.fn()
            },
            edit: jest.fn().mockResolvedValue()
        },
        ...extra
    };
}

function clickInteraction(customId, userId = 'p0') {
    return {
        customId,
        user: {id: userId},
        update: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue(),
        deferUpdate: jest.fn().mockResolvedValue(),
        followUp: jest.fn().mockResolvedValue({
            createMessageComponentCollector: () => ({
                on: () => {
                }
            })
        })
    };
}

describe('gameMsg', () => {
    test('lists each player card count and the current turn, mentioning the turn-holder', () => {
        const players = [makePlayer('p0', 0, [{}, {}], {turn: true}), makePlayer('p1', 1, [{}])];
        const game = makeGame(players);
        const out = gameMsg(game);
        expect(out.content).toContain('<@p0>');
        expect(out.content).toContain('uno.turn');
        expect(out.allowedMentions.users).toEqual(['p0']);
        expect(colorEmojis[game.lastCard.color]).toBeDefined();
        expect(out.content).toContain(game.lastCard.name);
    });

    test('appends a pending-draws warning when draws are stacked', () => {
        const players = [makePlayer('p0', 0, [{}], {turn: true})];
        const game = makeGame(players, {
            name: 'uno.draw2',
            color: 'red'
        }, {pendingDraws: 4});
        expect(gameMsg(game).content).toContain('uno.pending-draws');
    });

    test('shows an empty hand as 7 cards (lobby placeholder)', () => {
        const players = [makePlayer('p0', 0, [], {turn: true})];
        expect(gameMsg(makeGame(players)).content).toContain('**7**');
    });
});

describe('buildDeck', () => {
    test('turn player with playable card gets a draw button and an enabled card', () => {
        const player = makePlayer('p0', 0, [{
            name: '5',
            color: 'blue'
        }], {turn: true});
        const game = makeGame([player]);
        const rows = buildDeck(player, game).map(r => r.toJSON());
        // control row first button = draw
        expect(rows[0].components[0].custom_id).toBe('uno-draw');
        const cardBtn = rows[1].components[0];
        expect(cardBtn.disabled).toBe(false);
    });

    test('non-turn player gets an update button and all cards disabled', () => {
        const player = makePlayer('p0', 0, [{
            name: '5',
            color: 'blue'
        }], {turn: false});
        const game = makeGame([player]);
        const rows = buildDeck(player, game).map(r => r.toJSON());
        expect(rows[0].components[0].custom_id).toBe('uno-update');
        expect(rows[1].components[0].disabled).toBe(true);
    });

    test('neutral=true disables every card regardless of turn', () => {
        const player = makePlayer('p0', 0, [{
            name: '5',
            color: 'red'
        }], {turn: true});
        const game = makeGame([player]);
        const rows = buildDeck(player, game, true).map(r => r.toJSON());
        expect(rows[1].components[0].disabled).toBe(true);
    });
});

describe('perPlayerHandler', () => {
    test('uno-update just refreshes the hand for the player', () => {
        const player = makePlayer('p0', 0, [{
            name: '5',
            color: 'red'
        }], {turn: true});
        const game = makeGame([player]);
        const i = clickInteraction('uno-update');
        perPlayerHandler(i, player, game);
        expect(i.update).toHaveBeenCalledWith(expect.objectContaining({content: null}));
    });

    test('off-turn player clicking a card is told it is not their turn', () => {
        const player = makePlayer('p0', 0, [{
            name: '5',
            color: 'red'
        }], {turn: false});
        const game = makeGame([player]);
        const i = clickInteraction('uno-card-5-red-0');
        perPlayerHandler(i, player, game);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('playing an invalid card reports invalid-card and keeps the card', () => {
        const player = makePlayer('p0', 0, [{
            name: '9',
            color: 'blue'
        }, {
            name: '3',
            color: 'green'
        }, {
            name: '4',
            color: 'yellow'
        }], {turn: true});
        const game = makeGame([player], {
            name: '5',
            color: 'red'
        }); // 9/blue matches neither
        const i = clickInteraction('uno-card-9-blue-0');
        perPlayerHandler(i, player, game);
        expect(i.update).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('uno.invalid-card')}));
        expect(player.cards.length).toBe(3); // unchanged
    });

    test('playing the last card wins the game', () => {
        const player = makePlayer('p0', 0, [{
            name: '5',
            color: 'red'
        }], {
            turn: true,
            uno: true
        });
        const player2 = makePlayer('p1', 1, [{
            name: '1',
            color: 'red'
        }]);
        const game = makeGame([player, player2], {
            name: '5',
            color: 'red'
        });
        const i = clickInteraction('uno-card-5-red-0');
        perPlayerHandler(i, player, game);
        expect(i.update).toHaveBeenCalledWith(expect.objectContaining({
            content: 'uno.win-you',
            components: []
        }));
        expect(game.msg.edit).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('uno.win')}));
    });

    test('forgetting to call uno at 2 cards draws a penalty card and passes the turn', () => {
        const player = makePlayer('p0', 0, [{
            name: '5',
            color: 'red'
        }, {
            name: '7',
            color: 'red'
        }], {
            turn: true,
            uno: false
        });
        const player2 = makePlayer('p1', 1, [{
            name: '1',
            color: 'red'
        }]);
        const game = makeGame([player, player2], {
            name: '5',
            color: 'red'
        });
        const i = clickInteraction('uno-card-5-red-0');
        perPlayerHandler(i, player, game);
        expect(i.update).toHaveBeenCalledWith(expect.objectContaining({content: 'uno.missing-uno'}));
        expect(player.cards.length).toBe(3); // drew the penalty card instead of playing
        expect(player2.turn).toBe(true);
    });

    test('playing a reverse flips the direction', () => {
        const player = makePlayer('p0', 0, [{
            name: REVERSE,
            color: 'red'
        }, {
            name: '2',
            color: 'red'
        }, {
            name: '3',
            color: 'red'
        }], {turn: true});
        const player2 = makePlayer('p1', 1, [{
            name: '1',
            color: 'red'
        }]);
        const game = makeGame([player, player2], {
            name: '5',
            color: 'red'
        });
        const i = clickInteraction(`uno-card-${REVERSE}-red-0`);
        perPlayerHandler(i, player, game);
        expect(game.reversed).toBe(true);
        expect(game.lastCard).toEqual({
            name: REVERSE,
            color: 'red'
        });
    });

    test('playing a wild prompts for a colour choice', () => {
        const player = makePlayer('p0', 0, [{
            name: WILD,
            color: 'red'
        }, {
            name: '2',
            color: 'red'
        }, {
            name: '3',
            color: 'red'
        }], {turn: true});
        const game = makeGame([player, makePlayer('p1', 1, [{}])], {
            name: '5',
            color: 'red'
        });
        const i = clickInteraction(`uno-card-${WILD}-red-0`);
        perPlayerHandler(i, player, game);
        expect(i.update).toHaveBeenCalledWith(expect.objectContaining({content: 'uno.choose-color'}));
    });

    test('choosing a colour sets lastCard colour and advances the turn', () => {
        const player = makePlayer('p0', 0, [{
            name: '2',
            color: 'red'
        }], {turn: true});
        const player2 = makePlayer('p1', 1, [{
            name: '1',
            color: 'red'
        }]);
        const game = makeGame([player, player2], {
            name: WILD,
            color: 'red'
        });
        const i = clickInteraction(`uno-color-blue-${WILD}`);
        perPlayerHandler(i, player, game);
        expect(game.lastCard).toEqual({
            name: WILD,
            color: 'blue'
        });
        expect(player2.turn).toBe(true);
    });
});

describe('nextPlayer inactivity timers', () => {
    test('schedules an inactivity warning that mentions the next player after 60s', () => {
        const players = [makePlayer('p0', 0, [{}], {turn: true}), makePlayer('p1', 1, [{}])];
        const game = makeGame(players);
        nextPlayer(game, players[0]);
        expect(players[1].turn).toBe(true);
        jest.advanceTimersByTime(60 * 1000);
        expect(game.msg.channel.send).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('uno.inactive-warn')
        }));
    });

    test('kicks an inactive player after 2 minutes and ends the game when one remains', () => {
        const players = [makePlayer('p0', 0, [{}], {turn: true}), makePlayer('p1', 1, [{}])];
        const game = makeGame(players);
        nextPlayer(game, players[0]); // p1 now on turn
        jest.advanceTimersByTime(2 * 60 * 1000);
        expect(game.msg.edit).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('uno.inactive-win'),
            components: []
        }));
    });
});

describe('run lobby', () => {
    function makeRunInteraction(hostId = 'host') {
        const collector = {
            handlers: {},
            on(e, fn) {
                this.handlers[e] = fn;
                return this;
            },
            stop: jest.fn()
        };
        const msg = {
            id: 'm',
            channel: {id: 'c'},
            createMessageComponentCollector: jest.fn().mockReturnValue(collector),
            edit: jest.fn().mockResolvedValue()
        };
        const interaction = {
            user: {
                id: hostId,
                toString: () => `<@${hostId}>`
            },
            reply: jest.fn().mockResolvedValue(msg),
            editReply: jest.fn().mockResolvedValue(),
            followUp: jest.fn().mockResolvedValue({
                createMessageComponentCollector: () => ({
                    on: () => {
                    }
                })
            })
        };
        return {
            interaction,
            collector,
            msg
        };
    }

    function lobbyClick(customId, userId) {
        return {
            customId,
            user: {id: userId},
            update: jest.fn().mockResolvedValue(),
            reply: jest.fn().mockResolvedValue(),
            deferUpdate: jest.fn().mockResolvedValue(),
            followUp: jest.fn().mockResolvedValue({
                createMessageComponentCollector: () => ({
                    on: () => {
                    }
                })
            })
        };
    }

    test('posts a challenge message with join/start buttons', async () => {
        const {
            interaction,
            msg
        } = makeRunInteraction();
        await uno.run(interaction);
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.content).toContain('uno.challenge-message');
        expect(payload.components[0].components.map(c => c.customId)).toEqual(['uno-join', 'uno-start']);
        expect(msg.createMessageComponentCollector).toHaveBeenCalled();
    });

    test('a second user can join and the count updates', async () => {
        const {
            interaction,
            collector
        } = makeRunInteraction();
        await uno.run(interaction);
        const i = lobbyClick('uno-join', 'guest');
        await collector.handlers.collect(i);
        expect(i.update).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('uno.challenge-message')
        }));
    });

    test('joining twice is rejected', async () => {
        const {
            interaction,
            collector
        } = makeRunInteraction('host');
        await uno.run(interaction);
        // host is already player[0]
        const i = lobbyClick('uno-join', 'host');
        await collector.handlers.collect(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'uno.already-joined'}));
    });

    test('a non-host cannot start the game', async () => {
        const {
            interaction,
            collector
        } = makeRunInteraction('host');
        await uno.run(interaction);
        const i = lobbyClick('uno-start', 'guest');
        await collector.handlers.collect(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'uno.not-host'}));
    });

    test('host starting with too few players reports not-enough-players', async () => {
        const {
            interaction,
            collector
        } = makeRunInteraction('host');
        await uno.run(interaction);
        const i = lobbyClick('uno-start', 'host');
        await collector.handlers.collect(i);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: 'uno.not-enough-players',
            components: []
        }));
    });

    test('the uno button on a non-participant is rejected', async () => {
        const {
            interaction,
            collector
        } = makeRunInteraction('host');
        await uno.run(interaction);
        const i = lobbyClick('uno-uno', 'stranger');
        await collector.handlers.collect(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'uno.not-in-game'}));
    });
});