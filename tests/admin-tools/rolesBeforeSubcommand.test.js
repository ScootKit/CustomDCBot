/*
 * Tests for the /roles beforeSubcommand validator (commands/roles.js).
 * Covers the guard chain run before any role change:
 *  - unknown target member -> error reply
 *  - target role above the bot's highest role -> refused
 *  - target role at/above the caller's highest role (non-owner) -> refused
 *  - owner bypasses the caller-hierarchy check
 *  - invalid / too-short duration -> refused
 *  - valid duration -> parsed, removeDate set, interaction deferred
 *  - no role option -> straight to deferReply
 */
// parse-duration is ESM-only; stub it so the wrapper resolves synchronously.
jest.mock('parse-duration', () => ({
    __esModule: true,
    default: (input) => {
        if (input === '1h') return 3600000;
        if (input === '5s') return 5000;
        return null;
    }
}));

const durationParser = require('../../src/functions/parseDuration');
const before = require('../../modules/admin-tools/commands/roles').beforeSubcommand;

beforeAll(() => durationParser.init());

function role(position, id = 'r') {
    return {
        position,
        id,
        toString: () => `<@&${id}>`
    };
}

function makeInteraction({
                             member = null,
                             role: targetRole = null,
                             duration = null,
                             botHighest = 10,
                             callerHighest = 9,
                             ownerId = 'owner',
                             userId = 'caller'
                         } = {}) {
    return {
        guild: {
            ownerId,
            me: {roles: {highest: role(botHighest, 'bot')}},
            members: {fetch: jest.fn().mockResolvedValue(member)}
        },
        member: {roles: {highest: role(callerHighest, 'caller')}},
        user: {id: userId},
        options: {
            getUser: () => ({id: 'target'}),
            getRole: () => targetRole,
            getString: (n) => (n === 'duration' ? duration : null)
        },
        reply: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue()
    };
}

test('rejects when the target member cannot be fetched', async () => {
    const i = makeInteraction({member: null});
    await before(i);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('user-not-found')}));
    expect(i.deferReply).not.toHaveBeenCalled();
});

test('refuses a role positioned above the bot\'s highest role', async () => {
    const i = makeInteraction({
        member: {id: 'target'},
        role: role(20),
        botHighest: 10
    });
    await before(i);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('role-not-high-enough')}));
    expect(i.deferReply).not.toHaveBeenCalled();
});

test('refuses a non-owner managing a role at/above their own highest', async () => {
    const i = makeInteraction({
        member: {id: 'target'},
        role: role(9),
        botHighest: 30,
        callerHighest: 9,
        userId: 'caller'
    });
    await before(i);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('users-trying-to-manage-higher-role')}));
});

test('owner bypasses the caller-hierarchy check and defers', async () => {
    const i = makeInteraction({
        member: {id: 'target'},
        role: role(9),
        botHighest: 30,
        callerHighest: 9,
        ownerId: 'owner',
        userId: 'owner'
    });
    await before(i);
    expect(i.deferReply).toHaveBeenCalledWith({ephemeral: true});
});

test('rejects a duration that is too short', async () => {
    const i = makeInteraction({
        member: {id: 'target'},
        role: role(5),
        botHighest: 30,
        callerHighest: 20,
        duration: '5s'
    });
    await before(i);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('duration-wrong')}));
    expect(i.deferReply).not.toHaveBeenCalled();
});

test('accepts a valid duration, sets removeDate and defers', async () => {
    const i = makeInteraction({
        member: {id: 'target'},
        role: role(5),
        botHighest: 30,
        callerHighest: 20,
        duration: '1h'
    });
    await before(i);
    expect(i.duration).toBe(3600000);
    expect(i.removeDate).toBeInstanceOf(Date);
    expect(i.deferReply).toHaveBeenCalledWith({ephemeral: true});
    expect(i.reply).not.toHaveBeenCalled();
});

test('defers directly when no role option is provided', async () => {
    const i = makeInteraction({
        member: {id: 'target'},
        role: null
    });
    await before(i);
    expect(i.deferReply).toHaveBeenCalledWith({ephemeral: true});
    expect(i.reply).not.toHaveBeenCalled();
});