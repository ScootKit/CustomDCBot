/*
 * Pure-logic tests for the duel round resolution helpers extracted from
 * commands/duel.js.
 *
 * sortDuelAnswers(a, b) orders a pair of actions by the canonical priority
 *   reload < guard < gun, regardless of who chose what (this is the key used
 *   to look up the localized round outcome).
 * isDuelGameOver(sortedAnswers) encodes the single win condition: the duel ends
 *   only when one player shoots (gun) while the other is reloading.
 */

const {
    sortDuelAnswers,
    isDuelGameOver
} = require('../../modules/duel/commands/duel');

describe('sortDuelAnswers', () => {
    test('orders reload before gun', () => {
        expect(sortDuelAnswers('gun', 'reload')).toEqual(['reload', 'gun']);
    });

    test('orders reload before guard', () => {
        expect(sortDuelAnswers('guard', 'reload')).toEqual(['reload', 'guard']);
    });

    test('orders guard before gun', () => {
        expect(sortDuelAnswers('gun', 'guard')).toEqual(['guard', 'gun']);
    });

    test('is order-independent for the two inputs', () => {
        expect(sortDuelAnswers('gun', 'reload')).toEqual(sortDuelAnswers('reload', 'gun'));
    });

    test('keeps identical actions as a pair', () => {
        expect(sortDuelAnswers('guard', 'guard')).toEqual(['guard', 'guard']);
    });
});

describe('isDuelGameOver', () => {
    test('ends the game on reload vs gun', () => {
        expect(isDuelGameOver(sortDuelAnswers('reload', 'gun'))).toBe(true);
        expect(isDuelGameOver(sortDuelAnswers('gun', 'reload'))).toBe(true);
    });

    test('does not end on gun vs guard (a blocked shot)', () => {
        expect(isDuelGameOver(sortDuelAnswers('gun', 'guard'))).toBe(false);
    });

    test('does not end on mutual reload', () => {
        expect(isDuelGameOver(sortDuelAnswers('reload', 'reload'))).toBe(false);
    });

    test('does not end on mutual gun', () => {
        expect(isDuelGameOver(sortDuelAnswers('gun', 'gun'))).toBe(false);
    });

    test('does not end on guard vs reload', () => {
        expect(isDuelGameOver(sortDuelAnswers('guard', 'reload'))).toBe(false);
    });
});