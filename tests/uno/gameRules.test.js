/*
 * Pure game-rule tests for UNO.
 *
 * canUseCard decides whether a card may be played on top of game.lastCard,
 * factoring in: color/number match, wilds (color / colordraw4), and the
 * pending-draw stacking rule (while draws are pending you may only respond
 * with a draw2 / draw4). nextPlayer rotates the turn flag respecting play
 * direction (reversed) and the 2-player reverse-acts-as-skip special case.
 *
 * Card name constants come from the localize stub, so e.g. the wild is
 * "uno.color" and the +4 is "uno.colordraw4".
 */
const {__test} = require('../../modules/uno/commands/uno');
const {
    canUseCard,
    nextPlayer,
    colors
} = __test;

const WILD = 'uno.color';
const WILD4 = 'uno.colordraw4';
const DRAW2 = 'uno.draw2';

const game = (lastCard, pendingDraws = 0) => ({
    lastCard,
    pendingDraws,
    reversed: false,
    inactiveTimeout: [],
    players: [],
    msg: {
        channel: {send: jest.fn()},
        id: 'm',
        edit: jest.fn()
    }
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('canUseCard - basic matching', () => {
    const g = game({
        name: '5',
        color: 'red'
    });

    test('matches by identical color', () => {
        expect(canUseCard(g, {
            name: '9',
            color: 'red'
        }, [])).toBe(true);
    });

    test('matches by identical number/name', () => {
        expect(canUseCard(g, {
            name: '5',
            color: 'blue'
        }, [])).toBe(true);
    });

    test('rejects a card that matches neither color nor number', () => {
        expect(canUseCard(g, {
            name: '7',
            color: 'blue'
        }, [])).toBe(false);
    });
});

describe('canUseCard - wild cards', () => {
    test('a plain wild (color) can always be played', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        expect(canUseCard(g, {
            name: WILD,
            color: 'green'
        }, [])).toBe(true);
    });

    test('a +4 is playable when the player holds no card of the current color', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        const hand = [{
            name: '2',
            color: 'blue'
        }, {
            name: WILD4,
            color: 'green'
        }];
        expect(canUseCard(g, {
            name: WILD4,
            color: 'green'
        }, hand)).toBe(true);
    });

    test('a +4 is NOT auto-true when the player holds a matching-color card (falls back to color/name match)', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        // hand contains a red card, so the "true" shortcut does not apply.
        // The +4 card's own color is green which != red and name != 5, so false.
        const hand = [{
            name: '8',
            color: 'red'
        }, {
            name: WILD4,
            color: 'green'
        }];
        expect(canUseCard(g, {
            name: WILD4,
            color: 'green'
        }, hand)).toBe(false);
    });
});

describe('canUseCard - pending draw stacking', () => {
    test('while draws are pending, a normal card cannot be played', () => {
        const g = game({
            name: '5',
            color: 'red'
        }, 2);
        expect(canUseCard(g, {
            name: '5',
            color: 'red'
        }, [])).toBe(false);
    });

    test('while draws are pending, a draw2 may be stacked', () => {
        const g = game({
            name: DRAW2,
            color: 'red'
        }, 2);
        expect(canUseCard(g, {
            name: DRAW2,
            color: 'blue'
        }, [])).toBe(true);
    });

    test('while draws are pending on a non-draw2 last card, a +4 may be stacked', () => {
        // The +4 wild shortcut requires lastCard not be a draw2; use a +4 as lastCard.
        const g = game({
            name: WILD4,
            color: 'red'
        }, 4);
        expect(canUseCard(g, {
            name: WILD4,
            color: 'green'
        }, [])).toBe(true);
    });

    test('a +4 cannot be stacked directly onto a draw2 (implementation quirk)', () => {
        const g = game({
            name: DRAW2,
            color: 'red'
        }, 2);
        expect(canUseCard(g, {
            name: WILD4,
            color: 'green'
        }, [])).toBe(false);
    });
});

describe('nextPlayer - turn rotation', () => {
    function players(n) {
        return Array.from({length: n}, (_, i) => ({
            id: 'p' + i,
            n: i,
            turn: i === 0,
            uno: false
        }));
    }

    test('advances the turn to the next player in forward direction', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        g.players = players(3);
        nextPlayer(g, g.players[0]);
        expect(g.players[0].turn).toBe(false);
        expect(g.players[1].turn).toBe(true);
    });

    test('wraps around to the first player past the end', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        g.players = players(3);
        g.players[2].turn = true;
        g.players[0].turn = false;
        nextPlayer(g, g.players[2]);
        expect(g.players[0].turn).toBe(true);
    });

    test('moves backward when the game is reversed', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        g.reversed = true;
        g.players = players(3);
        g.players[2].turn = true;
        g.players[0].turn = false;
        nextPlayer(g, g.players[2]);
        expect(g.players[1].turn).toBe(true);
    });

    test('a "skip" (moves=2) jumps over the next player', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        g.players = players(3);
        nextPlayer(g, g.players[0], 2, true);
        expect(g.players[2].turn).toBe(true);
        expect(g.players[1].turn).toBe(false);
    });

    test('in a 2-player game, reverse-as-skip keeps the same player on turn', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        g.players = players(2);
        nextPlayer(g, g.players[0], 1, true);
        expect(g.players[0].turn).toBe(true);
        expect(g.players[1].turn).toBe(false);
    });

    test('clears the previous turn-holder uno flag on the new player', () => {
        const g = game({
            name: '5',
            color: 'red'
        });
        g.players = players(2);
        g.players[1].uno = true;
        nextPlayer(g, g.players[0]);
        expect(g.players[1].uno).toBe(false);
    });
});

describe('uno deck constants', () => {
    test('exposes the four standard colors', () => {
        expect(colors.sort()).toEqual(['blue', 'green', 'red', 'yellow']);
    });
});