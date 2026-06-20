/*
 * Tests for the levels guildMemberRemove handler. With reset-on-leave enabled it
 * deletes the leaver's XP row and refreshes the live leaderboard; with it
 * disabled it is a no-op, and it tolerates the leaver having no stored row.
 * The leaderboardChannel.updateLeaderBoard sink is mocked.
 */
const mockUpdate = jest.fn().mockResolvedValue();
jest.mock('../../modules/levels/leaderboardChannel', () => ({updateLeaderBoard: (...a) => mockUpdate(...a)}));

const handler = require('../../modules/levels/events/guildMemberRemove');

beforeEach(() => mockUpdate.mockClear());

function makeClient({
                        resetOnLeave = true,
                        user
                    } = {}) {
    return {
        configurations: {levels: {config: {'reset-on-leave': resetOnLeave}}},
        models: {levels: {User: {findOne: jest.fn().mockResolvedValue(user)}}}
    };
}

const member = {user: {id: 'gone'}};

test('does nothing when reset-on-leave is disabled', async () => {
    const client = makeClient({resetOnLeave: false});
    await handler.run(client, member);
    expect(client.models.levels.User.findOne).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
});

test('returns quietly when the leaver has no stored row', async () => {
    const client = makeClient({user: null});
    await handler.run(client, member);
    expect(mockUpdate).not.toHaveBeenCalled();
});

test('destroys the leaver row and refreshes the leaderboard', async () => {
    const row = {destroy: jest.fn().mockResolvedValue()};
    const client = makeClient({user: row});
    await handler.run(client, member);
    expect(client.models.levels.User.findOne).toHaveBeenCalledWith({where: {userID: 'gone'}});
    expect(row.destroy).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(client);
});