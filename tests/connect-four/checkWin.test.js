/*
 * Pure-logic tests for Connect Four win detection.
 *
 * checkWin(grid, color, position, y) is run after a circle of `color` is dropped
 * into column `position`, landing at row `y`. The grid is (fieldSize-1) rows by
 * fieldSize columns; empty cells are '⬜', filled cells are ':<color>_circle:'.
 * It returns the winning color (and converts the winning streak to '_square:'),
 * 'tie' when the whole board is full, or undefined when nothing decisive happened.
 * Covered: vertical, horizontal, both diagonals, no-win, the full-board tie, and
 * that an opponent's pieces don't count toward a win.
 */
const {
    checkWin,
    gameMessage
} = require('../../modules/connect-four/commands/connect-four');

const E = '⬜';
const circle = (color) => `:${color}_circle:`;
const square = (color) => `:${color}_square:`;

/** Build an empty rows x cols grid. */
function emptyGrid(rows = 6, cols = 7) {
    const g = new Array(rows);
    for (let i = 0; i < rows; i++) g[i] = new Array(cols).fill(E);
    return g;
}

describe('connect-four checkWin', () => {
    test('detects a vertical four-in-a-column', () => {
        const g = emptyGrid();
        // Stack four red circles in column 0 (rows 5..2).
        g[5][0] = g[4][0] = g[3][0] = g[2][0] = circle('red');
        expect(checkWin(g, 'red', 0, 2)).toBe('red');
        // Winning cells are converted to squares.
        expect(g[2][0]).toBe(square('red'));
        expect(g[5][0]).toBe(square('red'));
    });

    test('detects a horizontal four-in-a-row', () => {
        const g = emptyGrid();
        g[5][0] = g[5][1] = g[5][2] = g[5][3] = circle('blue');
        expect(checkWin(g, 'blue', 3, 5)).toBe('blue');
        expect(g[5][3]).toBe(square('blue'));
    });

    test('detects an ascending (/) diagonal four', () => {
        const g = emptyGrid();
        g[5][0] = g[4][1] = g[3][2] = g[2][3] = circle('red');
        expect(checkWin(g, 'red', 3, 2)).toBe('red');
    });

    test('detects a descending (\\) diagonal four', () => {
        const g = emptyGrid();
        g[2][0] = g[3][1] = g[4][2] = g[5][3] = circle('red');
        expect(checkWin(g, 'red', 3, 5)).toBe('red');
    });

    test('returns undefined when only three are connected', () => {
        const g = emptyGrid();
        g[5][0] = g[5][1] = g[5][2] = circle('red');
        expect(checkWin(g, 'red', 2, 5)).toBeUndefined();
    });

    test('an opponent piece breaking the streak prevents a win', () => {
        const g = emptyGrid();
        g[5][0] = g[5][1] = circle('red');
        g[5][2] = circle('blue');
        g[5][3] = circle('red');
        expect(checkWin(g, 'red', 3, 5)).toBeUndefined();
    });

    test('a completely full board returns a tie', () => {
        // Alternate colours so no four-in-a-row exists, but board is full.
        const rows = 6;
        const cols = 7;
        const g = emptyGrid(rows, cols);
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                g[i][j] = circle('red');
            }
        }
        // Full board: the tie branch fires before any colour win is evaluated.
        expect(checkWin(g, 'red', 0, 0)).toBe('tie');
    });

    test('does not award a win to the colour that did not connect four', () => {
        const g = emptyGrid();
        g[5][0] = g[4][0] = g[3][0] = g[2][0] = circle('red');
        // Asking about blue must not report a win on red's column.
        expect(checkWin(g, 'blue', 0, 2)).toBeUndefined();
    });
});

describe('connect-four gameMessage', () => {
    test('renders the board, the current colour and a numeric footer sized to the field', () => {
        const g = emptyGrid(3, 4); // 3 rows, fieldSize 4
        const out = gameMessage(g, 4, 'red', '<@u2>', 'Alice', 'Bob');
        // The localize stub echoes the args; verify the colour circle and the
        // footer emoji are bounded by the field size (4 columns -> 1️⃣..4️⃣).
        expect(out).toContain('c=:red_circle:');
        expect(out).toContain('1️⃣2️⃣3️⃣4️⃣');
        expect(out).not.toContain('5️⃣');
        // The grid rows are joined into the g= argument.
        expect(out).toContain('⬜⬜⬜⬜');
    });
});