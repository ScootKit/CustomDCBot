/*
 * Tests for polls/botReady: on startup it re-schedules an end job for every
 * poll whose expiresAt is still in the future, and skips polls that already
 * expired or have no expiry.
 */
const mockScheduleJob = jest.fn();
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockScheduleJob(...a)}));
jest.mock('../../modules/polls/polls', () => ({updateMessage: jest.fn().mockResolvedValue()}));

const handler = require('../../modules/polls/events/botReady');

beforeEach(() => mockScheduleJob.mockClear());

function makeClient(polls) {
    return {
        models: {polls: {Poll: {findAll: jest.fn().mockResolvedValue(polls)}}},
        channels: {fetch: jest.fn().mockResolvedValue({id: 'c'})}
    };
}

test('schedules a job only for future, non-expired polls', async () => {
    const future = new Date(Date.now() + 100000);
    const past = new Date(Date.now() - 100000);
    const client = makeClient([
        {
            messageID: '1',
            channelID: 'c',
            expiresAt: future
        },
        {
            messageID: '2',
            channelID: 'c',
            expiresAt: past
        },
        {
            messageID: '3',
            channelID: 'c',
            expiresAt: null
        }
    ]);
    await handler.run(client);
    expect(mockScheduleJob).toHaveBeenCalledTimes(1);
});

test('schedules nothing when there are no polls', async () => {
    const client = makeClient([]);
    await handler.run(client);
    expect(mockScheduleJob).not.toHaveBeenCalled();
});