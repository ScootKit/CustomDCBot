/*
 * Pure win/draw detection tests for tic-tac-toe.
 *
 * detectWin/isBoardFull were extracted (behavior-preserving) from the in-game
 * checkGameEnded closure so the line-scan logic can be exercised directly:
 * rows, columns, both diagonals, "no win", and full-board draw detection.
 * The grid uses string row/col keys "1".."3" mapping to an owner id or null.
 */
const {
    detectWin,
    isBoardFull
} = require('../../modules/tic-tak-toe/commands/tic-tac-toe');

const A = 'playerA';
const B = 'playerB';

function emptyGrid() {
    return {
        1: {
            1: null,
            2: null,
            3: null
        },
        2: {
            1: null,
            2: null,
            3: null
        },
        3: {
            1: null,
            2: null,
            3: null
        }
    };
}

/** Build a grid from a 3x3 array of 'A' | 'B' | null. */
function grid(rows) {
    const map = {
        A,
        B
    };
    const g = emptyGrid();
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const v = rows[r][c];
            g[r + 1][c + 1] = v === null ? null : map[v];
        }
    }
    return g;
}

describe('detectWin', () => {
    test('detects a top row win', () => {
        const g = grid([
            ['A', 'A', 'A'],
            [null, 'B', null],
            ['B', null, null]
        ]);
        expect(detectWin(g, A)).toBe(true);
        expect(detectWin(g, B)).toBe(false);
    });

    test('detects a middle column win', () => {
        const g = grid([
            ['B', 'A', null],
            [null, 'A', 'B'],
            [null, 'A', null]
        ]);
        expect(detectWin(g, A)).toBe(true);
    });

    test('detects the main (top-left to bottom-right) diagonal', () => {
        const g = grid([
            ['A', 'B', null],
            ['B', 'A', null],
            [null, null, 'A']
        ]);
        expect(detectWin(g, A)).toBe(true);
    });

    test('detects the anti (top-right to bottom-left) diagonal', () => {
        const g = grid([
            [null, 'B', 'A'],
            ['B', 'A', null],
            ['A', null, null]
        ]);
        expect(detectWin(g, A)).toBe(true);
    });

    test('returns false on an empty board', () => {
        expect(detectWin(emptyGrid(), A)).toBe(false);
    });

    test('returns false for a board with no line', () => {
        const g = grid([
            ['A', 'B', 'A'],
            ['B', 'A', 'B'],
            ['B', 'A', 'B']
        ]);
        expect(detectWin(g, A)).toBe(false);
        expect(detectWin(g, B)).toBe(false);
    });

    test('two non-adjacent same-owner cells are not a win', () => {
        const g = grid([
            ['A', null, 'A'],
            [null, null, null],
            [null, null, null]
        ]);
        expect(detectWin(g, A)).toBe(false);
    });
});

describe('isBoardFull', () => {
    test('false when at least one cell is empty', () => {
        const g = grid([
            ['A', 'B', 'A'],
            ['B', 'A', 'B'],
            ['B', 'A', null]
        ]);
        expect(isBoardFull(g)).toBe(false);
    });

    test('true when every cell is filled', () => {
        const g = grid([
            ['A', 'B', 'A'],
            ['B', 'A', 'B'],
            ['B', 'A', 'B']
        ]);
        expect(isBoardFull(g)).toBe(true);
    });

    test('false for an empty board', () => {
        expect(isBoardFull(emptyGrid())).toBe(false);
    });
});

describe('draw vs win interaction', () => {
    test('a full board with a winning line is still a win for that player', () => {
        const g = grid([
            ['A', 'A', 'A'],
            ['B', 'B', 'A'],
            ['B', 'A', 'B']
        ]);
        expect(isBoardFull(g)).toBe(true);
        expect(detectWin(g, A)).toBe(true);
    });
});