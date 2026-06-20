/*
 * Tests for ping-protection/botReady: it runs retention enforcement and AutoMod
 * sync immediately, then schedules a daily 03:00 job that repeats both, pushing
 * the job onto client.jobs.
 */
const mockEnforce = jest.fn().mockResolvedValue();
const mockSync = jest.fn().mockResolvedValue();
const mockScheduleJob = jest.fn(() => 'job');
jest.mock('../../modules/ping-protection/ping-protection', () => ({
    enforceRetention: (...a) => mockEnforce(...a),
    syncNativeAutoMod: (...a) => mockSync(...a)
}));
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockScheduleJob(...a)}));

const handler = require('../../modules/ping-protection/events/botReady');

beforeEach(() => {
    mockEnforce.mockClear();
    mockSync.mockClear();
    mockScheduleJob.mockClear();
});

test('runs retention + automod sync on startup and registers the daily job', async () => {
    const client = {jobs: []};
    await handler.run(client);
    expect(mockEnforce).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockScheduleJob).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
    expect(client.jobs).toHaveLength(1);
});

test('the scheduled job re-runs retention and automod sync', async () => {
    const client = {jobs: []};
    let cron;
    mockScheduleJob.mockImplementation((spec, cb) => {
        cron = cb;
        return 'job';
    });
    await handler.run(client);
    mockEnforce.mockClear();
    mockSync.mockClear();
    await cron();
    expect(mockEnforce).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledTimes(1);
});
