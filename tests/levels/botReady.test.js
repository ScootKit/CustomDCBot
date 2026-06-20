/*
 * Tests for the levels botReady (modules/levels/events/botReady.js) - the
 * non-custom-curve paths. When no custom level curve is configured it skips the
 * fparser import and, if a leaderboard channel is set, performs a forced
 * leaderboard refresh and registers the periodic update interval; otherwise it
 * returns without scheduling. updateLeaderBoard and disableModule are mocked.
 * (The custom-curve branch uses a dynamic ESM import that Jest's CJS runtime
 * can't intercept here, so it is exercised via calculate-level/messageCurve
 * tests instead.)
 */
const mockUpdate = jest.fn().mockResolvedValue();
const mockDisable = jest.fn();
jest.mock('../../modules/levels/leaderboardChannel', () => ({updateLeaderBoard: (...a) => mockUpdate(...a)}));
jest.mock('../../src/functions/helpers', () => ({disableModule: (...a) => mockDisable(...a)}));

const handler = require('../../modules/levels/events/botReady');

beforeEach(() => {
    mockUpdate.mockClear();
    mockDisable.mockClear();
});

function makeClient(config) {
    return {
        configurations: {levels: {config}},
        intervals: [],
        logger: {error: jest.fn()}
    };
}

test('returns without scheduling when no leaderboard channel is set', async () => {
    const client = makeClient({'leaderboard-channel': null});
    await handler.run(client);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(client.intervals).toHaveLength(0);
});

test('forces a leaderboard refresh and registers an interval', async () => {
    const client = makeClient({'leaderboard-channel': 'lb1'});
    await handler.run(client);
    expect(mockUpdate).toHaveBeenCalledWith(client, true);
    expect(client.intervals).toHaveLength(1);
    clearInterval(client.intervals[0]);
});

test('does not disable the module on the plain (no custom curve) path', async () => {
    const client = makeClient({'leaderboard-channel': null});
    await handler.run(client);
    expect(mockDisable).not.toHaveBeenCalled();
});