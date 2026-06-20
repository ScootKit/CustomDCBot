/*
 * Tests for the fun module's /random subcommands. We mock helpers (embedType,
 * randomIntFromInterval, randomElementFromArray) and the ikea-name generator so
 * we can assert on the computed interpolation args rather than rendered embeds.
 * Covers:
 *   - number: default min/max (1..42) when no options given, passthrough of
 *     provided min/max, and that the rolled number uses those bounds
 *   - ikea-name: syllable count is capped at 20, default randomized 1..4 path
 *   - dice: rolls 1..6
 *   - coinflip: localizes one of the two sides
 *   - 8ball: answers with an element from the configured pool
 */
const mockEmbedType = jest.fn((input, args) => ({
    input,
    args
}));
const mockRandomInt = jest.fn();
const mockRandomElement = jest.fn();
const mockIkea = jest.fn(() => 'BJURSTA');

jest.mock('../../src/functions/helpers', () => ({
    embedType: (...a) => mockEmbedType(...a),
    randomIntFromInterval: (...a) => mockRandomInt(...a),
    randomElementFromArray: (...a) => mockRandomElement(...a)
}));
jest.mock('@scderox/ikea-name-generator', () => ({generateIkeaName: (...a) => mockIkea(...a)}));

const {subcommands} = require('../../modules/fun/commands/random');

function makeInteraction(opts = {}) {
    const config = {
        randomNumberMessage: 'NUM',
        ikeaMessage: 'IKEA',
        diceRollMessage: 'DICE',
        coinFlipMessage: 'COIN',
        '8ballMessage': 'BALL',
        '8BallMessages': ['Yes', 'No', 'Maybe']
    };
    return {
        reply: jest.fn(),
        client: {configurations: {fun: {config}}},
        options: {getNumber: jest.fn((name) => (name in opts ? opts[name] : null))}
    };
}

beforeEach(() => {
    mockEmbedType.mockClear();
    mockRandomInt.mockReset();
    mockRandomElement.mockReset();
    mockIkea.mockClear();
});

describe('number', () => {
    test('defaults to 1..42 and rolls within those bounds', () => {
        mockRandomInt.mockReturnValue(17);
        const interaction = makeInteraction();
        subcommands.number(interaction);
        expect(mockRandomInt).toHaveBeenCalledWith(1, 42);
        const args = mockEmbedType.mock.calls[0][1];
        expect(args['%min%']).toBe(1);
        expect(args['%max%']).toBe(42);
        expect(args['%number%']).toBe(17);
    });

    test('uses provided min/max', () => {
        mockRandomInt.mockReturnValue(8);
        const interaction = makeInteraction({
            min: 5,
            max: 10
        });
        subcommands.number(interaction);
        expect(mockRandomInt).toHaveBeenCalledWith(5, 10);
        const args = mockEmbedType.mock.calls[0][1];
        expect(args['%min%']).toBe(5);
        expect(args['%max%']).toBe(10);
    });
});

describe('ikea-name', () => {
    test('caps the syllable count at 20', () => {
        const interaction = makeInteraction({'syllable-count': 50});
        subcommands['ikea-name'](interaction);
        expect(mockIkea).toHaveBeenCalledWith(20);
    });

    test('passes through a small explicit count', () => {
        const interaction = makeInteraction({'syllable-count': 3});
        subcommands['ikea-name'](interaction);
        expect(mockIkea).toHaveBeenCalledWith(3);
    });

    test('uses a randomized 1..4 count when none is given', () => {
        const interaction = makeInteraction();
        subcommands['ikea-name'](interaction);
        const count = mockIkea.mock.calls[0][0];
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(4);
    });
});

describe('dice', () => {
    test('rolls a six-sided die', () => {
        mockRandomInt.mockReturnValue(4);
        const interaction = makeInteraction();
        subcommands.dice(interaction);
        expect(mockRandomInt).toHaveBeenCalledWith(1, 6);
        expect(mockEmbedType.mock.calls[0][1]['%number%']).toBe(4);
    });
});

describe('coinflip', () => {
    test('localizes one of the two sides', () => {
        mockRandomInt.mockReturnValue(2);
        const interaction = makeInteraction();
        subcommands.coinflip(interaction);
        expect(mockRandomInt).toHaveBeenCalledWith(1, 2);
        // localize stub renders "fun.dice-site-<n>"
        expect(mockEmbedType.mock.calls[0][1]['%site%']).toBe('fun.dice-site-2');
    });
});

describe('8ball', () => {
    test('answers with an element from the configured pool', () => {
        mockRandomElement.mockImplementation(arr => arr[1]);
        const interaction = makeInteraction();
        subcommands['8ball'](interaction);
        expect(mockRandomElement).toHaveBeenCalledWith(['Yes', 'No', 'Maybe']);
        expect(mockEmbedType.mock.calls[0][1]['%answer%']).toBe('No');
    });
});