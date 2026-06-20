/*
 * Unit tests for the rock-paper-scissors pure game logic:
 *   - findWinner(): the win/lose/tie resolution table (rock>scissors>paper>rock)
 *   - mentionUsers(): who still needs to move (only non-bot, still-pending players)
 *   - resetGame(): resets per-player state, with the bot pre-"selected"
 *
 * Localized strings come from the deterministic localize stub, so e.g.
 * localize('rock-paper-scissors','won') === 'rock-paper-scissors.won'. moves are
 * exported as ['🪨 …stone', '📄 …paper', '✂️ …scissors'] in that order.
 */

const rps = require('../../modules/rock-paper-scissors/commands/rock-paper-scissors');

const [STONE, PAPER, SCISSORS] = rps._moves;
const WON = 'rock-paper-scissors.won';
const LOST = 'rock-paper-scissors.lost';
const TIE = 'rock-paper-scissors.tie';

describe('rock-paper-scissors findWinner', () => {
    test('identical moves are a tie for both players', () => {
        expect(rps.findWinner(STONE, STONE)).toEqual({
            win1: TIE,
            win2: TIE
        });
        expect(rps.findWinner(PAPER, PAPER)).toEqual({
            win1: TIE,
            win2: TIE
        });
        expect(rps.findWinner(SCISSORS, SCISSORS)).toEqual({
            win1: TIE,
            win2: TIE
        });
    });

    test('stone beats scissors', () => {
        expect(rps.findWinner(STONE, SCISSORS)).toEqual({
            win1: WON,
            win2: LOST
        });
        expect(rps.findWinner(SCISSORS, STONE)).toEqual({
            win1: LOST,
            win2: WON
        });
    });

    test('paper beats stone', () => {
        expect(rps.findWinner(PAPER, STONE)).toEqual({
            win1: WON,
            win2: LOST
        });
        expect(rps.findWinner(STONE, PAPER)).toEqual({
            win1: LOST,
            win2: WON
        });
    });

    test('scissors beats paper', () => {
        expect(rps.findWinner(SCISSORS, PAPER)).toEqual({
            win1: WON,
            win2: LOST
        });
        expect(rps.findWinner(PAPER, SCISSORS)).toEqual({
            win1: LOST,
            win2: WON
        });
    });

    test('win/lose is never symmetric across the full matrix', () => {
        const all = [STONE, PAPER, SCISSORS];
        for (const a of all) {
            for (const b of all) {
                const {
                    win1,
                    win2
                } = rps.findWinner(a, b);
                if (a === b) {
                    expect(win1).toBe(TIE);
                    expect(win2).toBe(TIE);
                } else {
                    // exactly one winner, one loser
                    expect([win1, win2].sort()).toEqual([LOST, WON].sort());
                }
            }
        }
    });
});

describe('rock-paper-scissors mentionUsers', () => {
    test('mentions both human players while both are pending', () => {
        const game = {
            user1: {
                id: '1',
                bot: false
            },
            user2: {
                id: '2',
                bot: false
            },
            state1: 'none',
            state2: 'none'
        };
        expect(rps.mentionUsers(game)).toBe('<@1> <@2>');
    });

    test('only mentions the player who has not yet picked', () => {
        const game = {
            user1: {
                id: '1',
                bot: false
            },
            user2: {
                id: '2',
                bot: false
            },
            state1: 'selected',
            state2: 'none'
        };
        expect(rps.mentionUsers(game)).toBe('<@2>');
    });

    test('never mentions a bot opponent', () => {
        const game = {
            user1: {
                id: '1',
                bot: false
            },
            user2: {
                id: 'bot',
                bot: true
            },
            state1: 'none',
            state2: 'none'
        };
        expect(rps.mentionUsers(game)).toBe('<@1>');
    });

    test('returns null when nobody is pending', () => {
        const game = {
            user1: {
                id: '1',
                bot: false
            },
            user2: {
                id: '2',
                bot: false
            },
            state1: 'selected',
            state2: 'selected'
        };
        expect(rps.mentionUsers(game)).toBeNull();
    });
});

describe('rock-paper-scissors resetGame', () => {
    test('resets both human players to none and clears selections', () => {
        const game = {
            user1: {
                id: '1',
                bot: false
            },
            user2: {
                id: '2',
                bot: false
            },
            msg: 'm1',
            state1: 'selected',
            state2: 'selected',
            selected1: 'rps_stone',
            selected2: 'rps_paper'
        };
        rps.resetGame(game);
        expect(game.state1).toBe('none');
        expect(game.state2).toBe('none');
        expect(game.selected1).toBeUndefined();
        expect(game.selected2).toBeUndefined();
        // stored back into the games registry under its message id
        expect(rps._rpsgames['m1']).toBe(game);
    });

    test('pre-selects the bot opponent so only the human must move', () => {
        const game = {
            user1: {
                id: '1',
                bot: false
            },
            user2: {
                id: 'bot',
                bot: true
            },
            msg: 'm2',
            state1: 'selected',
            state2: 'selected'
        };
        rps.resetGame(game);
        expect(game.state1).toBe('none');
        expect(game.state2).toBe('selected');
    });

    test('returns two action rows (buttons + player row)', () => {
        const game = {
            user1: {
                id: '1',
                bot: false,
                tag: 'A#1',
                discriminator: '1',
                username: 'A'
            },
            user2: {
                id: '2',
                bot: false,
                tag: 'B#1',
                discriminator: '1',
                username: 'B'
            },
            msg: 'm3',
            state1: 'none',
            state2: 'none'
        };
        const rows = rps.resetGame(game);
        expect(Array.isArray(rows)).toBe(true);
        expect(rows).toHaveLength(2);
    });
});