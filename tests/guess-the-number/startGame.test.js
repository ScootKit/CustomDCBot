/*
 * Tests for guess-the-number's startGame (guessTheNumber.js) and the botReady
 * auto-game bootstrap.
 *
 * startGame: creates the Channel row, unpins the bot's own old pinned messages,
 *   sends + pins the start message, includes a leaderboard button only when the
 *   leaderboard is enabled, and unlocks a previously locked channel.
 * botReady: when the auto game channel is enabled, fetches the channel and
 *   starts a game only if none is already running; bails when the channel is
 *   missing or a game already exists.
 */
const mockEmbedType = jest.fn((input, args, opts) => ({
    input,
    args,
    opts
}));
const mockUnlockChannel = jest.fn().mockResolvedValue();
const mockRandomInt = jest.fn(() => 50);
jest.mock('../../src/functions/helpers', () => ({
    embedType: (...a) => mockEmbedType(...a),
    unlockChannel: (...a) => mockUnlockChannel(...a),
    randomIntFromInterval: (...a) => mockRandomInt(...a)
}));

const {startGame} = require('../../modules/guess-the-number/guessTheNumber');

function makePins(pins = []) {
    return {values: () => pins};
}

function makeChannel({
                         pins = [],
                         leaderboard = false,
                         channelLock = null
                     } = {}) {
    const startMsg = {pin: jest.fn().mockResolvedValue()};
    const client = {
        user: {id: 'bot'},
        configurations: {
            'guess-the-number': {
                config: {
                    enableLeaderboard: leaderboard,
                    startMessage: 'START'
                }
            }
        },
        models: {
            'guess-the-number': {Channel: {create: jest.fn().mockResolvedValue()}},
            ChannelLock: {findOne: jest.fn().mockResolvedValue(channelLock)}
        }
    };
    return {
        id: 'chan',
        client,
        messages: {fetchPinned: jest.fn().mockResolvedValue(makePins(pins))},
        send: jest.fn().mockResolvedValue(startMsg),
        _startMsg: startMsg
    };
}

beforeEach(() => {
    mockEmbedType.mockClear();
    mockUnlockChannel.mockClear();
});

test('creates the channel row with the given parameters', async () => {
    const channel = makeChannel();
    await startGame(channel, 42, 1, 100, 'owner');
    expect(channel.client.models['guess-the-number'].Channel.create).toHaveBeenCalledWith(
        expect.objectContaining({
            channelID: 'chan',
            number: 42,
            min: 1,
            max: 100,
            ownerID: 'owner',
            ended: false
        })
    );
});

test('unpins the bot\'s own old pinned messages only', async () => {
    const botPin = {
        author: {id: 'bot'},
        unpin: jest.fn().mockResolvedValue()
    };
    const otherPin = {
        author: {id: 'someone'},
        unpin: jest.fn().mockResolvedValue()
    };
    const channel = makeChannel({pins: [botPin, otherPin]});
    await startGame(channel, 1, 1, 10);
    expect(botPin.unpin).toHaveBeenCalled();
    expect(otherPin.unpin).not.toHaveBeenCalled();
});

test('sends and pins the start message', async () => {
    const channel = makeChannel();
    await startGame(channel, 1, 1, 10);
    expect(channel.send).toHaveBeenCalled();
    expect(channel._startMsg.pin).toHaveBeenCalled();
    expect(mockEmbedType.mock.calls[0][1]).toEqual({
        '%min%': 1,
        '%max%': 10
    });
});

test('omits the leaderboard button when the leaderboard is disabled', async () => {
    const channel = makeChannel({leaderboard: false});
    await startGame(channel, 1, 1, 10);
    const buttons = mockEmbedType.mock.calls[0][2].components[0].components;
    expect(buttons.find(b => b.customId === 'gtn-leaderboard')).toBeUndefined();
    expect(buttons.find(b => b.customId === 'gtn-reaction-meaning')).toBeDefined();
});

test('includes the leaderboard button when enabled', async () => {
    const channel = makeChannel({leaderboard: true});
    await startGame(channel, 1, 1, 10);
    const buttons = mockEmbedType.mock.calls[0][2].components[0].components;
    expect(buttons.find(b => b.customId === 'gtn-leaderboard')).toBeDefined();
});

test('unlocks the channel if it was previously locked', async () => {
    const channel = makeChannel({channelLock: {id: 'chan'}});
    await startGame(channel, 1, 1, 10);
    expect(mockUnlockChannel).toHaveBeenCalledWith(channel, expect.any(String));
});

test('does not unlock when no channel lock exists', async () => {
    const channel = makeChannel({channelLock: null});
    await startGame(channel, 1, 1, 10);
    expect(mockUnlockChannel).not.toHaveBeenCalled();
});

describe('botReady auto-game', () => {
    // Re-require with startGame mocked so we test only the bootstrap decisions.
    jest.resetModules();
    const mockStartGame = jest.fn().mockResolvedValue();
    jest.doMock('../../modules/guess-the-number/guessTheNumber', () => ({startGame: (...a) => mockStartGame(...a)}));
    jest.doMock('../../src/functions/helpers', () => ({randomIntFromInterval: () => 5}));
    const botReady = require('../../modules/guess-the-number/events/botReady');

    function makeClient({
                            enabled = true,
                            channel = {id: 'game'},
                            game = null
                        } = {}) {
        return {
            configurations: {
                'guess-the-number': {
                    channel: {
                        enabled,
                        channel: 'game',
                        minInt: 1,
                        maxInt: 10
                    }
                }
            },
            guild: {channels: {fetch: jest.fn().mockResolvedValue(channel)}},
            models: {'guess-the-number': {Channel: {findOne: jest.fn().mockResolvedValue(game)}}}
        };
    }

    beforeEach(() => mockStartGame.mockClear());

    test('starts a game when none is running', async () => {
        const client = makeClient({game: null});
        await botReady.run(client);
        expect(mockStartGame).toHaveBeenCalled();
    });

    test('does not start when a game is already running', async () => {
        const client = makeClient({game: {id: 1}});
        await botReady.run(client);
        expect(mockStartGame).not.toHaveBeenCalled();
    });

    test('bails when the channel cannot be fetched', async () => {
        const client = makeClient({channel: null});
        await botReady.run(client);
        expect(mockStartGame).not.toHaveBeenCalled();
    });
});