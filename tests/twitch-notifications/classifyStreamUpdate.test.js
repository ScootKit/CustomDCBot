/*
 * Tests for the twitch-notifications poll classifier.
 *
 * classifyStreamUpdate was extracted (behavior-preserving) from the `start`
 * branch ladder. It maps (stream, persistedStreamer) to the action the poller
 * takes: user not found, a brand new live stream, a re-live (different start
 * time than what we stored), going offline, or no change (same stream as last
 * poll). This is the dedup heart of the module - the same stream must not
 * re-announce.
 */
// @twurple packages are ESM-only and only used inside run(); stub them so the
// module loads under CommonJS jest.
jest.mock('@twurple/api', () => ({
    ApiClient: class {
    }
}), {virtual: true});
jest.mock('@twurple/auth', () => ({
    AppTokenAuthProvider: class {
    }
}), {virtual: true});

const {classifyStreamUpdate} = require('../../modules/twitch-notifications/events/botReady').__test;

const stream = (startDate) => ({
    startDate: {toString: () => startDate},
    userDisplayName: 'Streamer'
});

test('returns userNotFound for the sentinel string', () => {
    expect(classifyStreamUpdate('userNotFound', null)).toBe('userNotFound');
    expect(classifyStreamUpdate('userNotFound', {startedAt: 'x'})).toBe('userNotFound');
});

test('returns newLive when live but no row is stored yet', () => {
    expect(classifyStreamUpdate(stream('2024-01-01'), null)).toBe('newLive');
});

test('returns reLive when the stored start time differs from the current stream', () => {
    expect(classifyStreamUpdate(stream('2024-01-02'), {startedAt: '2024-01-01'})).toBe('reLive');
});

test('returns noChange when the stream start time matches the stored one (dedup)', () => {
    expect(classifyStreamUpdate(stream('2024-01-01'), {startedAt: '2024-01-01'})).toBe('noChange');
});

test('returns offline when the stream is null', () => {
    expect(classifyStreamUpdate(null, {startedAt: '2024-01-01'})).toBe('offline');
    expect(classifyStreamUpdate(null, null)).toBe('offline');
});