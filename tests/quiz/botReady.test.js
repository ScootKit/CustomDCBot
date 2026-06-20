/*
 * Tests for quiz/botReady: re-schedules end jobs for future non-private quizzes,
 * optionally forces a leaderboard render + sets up a refresh interval, and always
 * registers the daily-reset cron job.
 */
const mockScheduleJob = jest.fn(() => 'job');
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockScheduleJob(...a)}));
const mockUpdateLeaderboard = jest.fn().mockResolvedValue();
const mockUpdateMessage = jest.fn().mockResolvedValue();
jest.mock('../../modules/quiz/quizUtil', () => ({
    updateLeaderboard: (...a) => mockUpdateLeaderboard(...a),
    updateMessage: (...a) => mockUpdateMessage(...a)
}));

const handler = require('../../modules/quiz/events/botReady');

beforeEach(() => {
    jest.useFakeTimers();
    mockScheduleJob.mockClear();
    mockUpdateLeaderboard.mockClear();
});
afterEach(() => jest.useRealTimers());

function makeClient(quizzes, {leaderboardChannel} = {}) {
    return {
        jobs: [],
        intervals: [],
        channels: {fetch: jest.fn().mockResolvedValue({id: 'c'})},
        configurations: {quiz: {config: {leaderboardChannel}}},
        models: {
            quiz: {
                QuizList: {findAll: jest.fn().mockResolvedValue(quizzes)},
                QuizUser: {findAll: jest.fn().mockResolvedValue([])}
            }
        }
    };
}

test('schedules end jobs only for future, non-private quizzes and the daily reset', async () => {
    const future = new Date(Date.now() + 100000);
    const past = new Date(Date.now() - 100000);
    const client = makeClient([
        {
            messageID: '1',
            channelID: 'c',
            private: false,
            expiresAt: future
        },
        {
            messageID: '2',
            channelID: 'c',
            private: true,
            expiresAt: future
        },
        {
            messageID: '3',
            channelID: 'c',
            private: false,
            expiresAt: past
        }
    ]);
    await handler.run(client);
    // 1 future-public end job + 1 daily-reset cron job = 2 schedule calls
    expect(mockScheduleJob).toHaveBeenCalledTimes(2);
    expect(client.jobs).toHaveLength(1); // only the daily reset is pushed to jobs
});

test('forces an initial leaderboard render and registers a refresh interval when configured', async () => {
    const client = makeClient([], {leaderboardChannel: 'lb'});
    await handler.run(client);
    expect(mockUpdateLeaderboard).toHaveBeenCalledWith(client, true);
    expect(client.intervals).toHaveLength(1);
});

test('skips the leaderboard refresh interval when no channel is configured', async () => {
    const client = makeClient([]);
    await handler.run(client);
    expect(mockUpdateLeaderboard).not.toHaveBeenCalled();
    expect(client.intervals).toHaveLength(0);
});

test('the daily reset job clears each QuizUser dailyQuiz counter', async () => {
    let cronCb;
    mockScheduleJob.mockImplementation((spec, cb) => {
        if (spec === '1 0 * * *') cronCb = cb;
        return 'job';
    });
    const users = [{
        dailyQuiz: 5,
        save: jest.fn()
    }, {
        dailyQuiz: 2,
        save: jest.fn()
    }];
    const client = makeClient([]);
    client.models.quiz.QuizUser.findAll.mockResolvedValue(users);
    await handler.run(client);
    await cronCb();
    expect(users[0].dailyQuiz).toBe(0);
    expect(users[0].save).toHaveBeenCalled();
    expect(users[1].dailyQuiz).toBe(0);
});