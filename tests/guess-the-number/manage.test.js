/*
 * Tests for the guess-the-number /guess-the-number management command
 * (modules/guess-the-number/commands/manage.js).
 *
 * beforeSubcommand: admin-role gating + the "game channel mode" lockout.
 * subcommands:
 *   - end:    no-active-session guard, then lock + destroy the session
 *   - status: no-active-session guard, then report the running session
 *   - create: already-running guard, min>=max guard, number-out-of-range guards,
 *             and the happy path that calls startGame with the chosen number.
 */
const mockStartGame = jest.fn().mockResolvedValue();
const mockLockChannel = jest.fn().mockResolvedValue();
const mockRandomInt = jest.fn(() => 50);
jest.mock('../../modules/guess-the-number/guessTheNumber', () => ({startGame: (...a) => mockStartGame(...a)}));
jest.mock('../../src/functions/helpers', () => ({
    randomIntFromInterval: (...a) => mockRandomInt(...a),
    embedType: (x) => ({content: x}),
    lockChannel: (...a) => mockLockChannel(...a),
    unlockChannel: jest.fn()
}));

const cmd = require('../../modules/guess-the-number/commands/manage');

function roleCache(roleIds = []) {
    const cache = new Map(roleIds.map(id => [id, {id}]));
    cache.filter = (fn) => ({size: [...cache.values()].filter(fn).length});
    return cache;
}

function makeInteraction({
                             roleIds = ['admin'],
                             adminRoles = ['admin'],
                             channelEnabled = false,
                             channelId = 'chan',
                             gameChannelId = 'game',
                             session = null,
                             options = {},
                             replied = false
                         } = {}) {
    return {
        replied,
        channel: {id: channelId},
        user: {id: 'u1'},
        member: {roles: {cache: roleCache(roleIds)}},
        reply: jest.fn().mockResolvedValue(),
        options: {
            getInteger: jest.fn((name) => (name in options ? options[name] : null))
        },
        client: {
            configurations: {
                'guess-the-number': {
                    config: {adminRoles},
                    channel: {
                        enabled: channelEnabled,
                        channel: gameChannelId
                    }
                }
            },
            models: {'guess-the-number': {Channel: {findOne: jest.fn().mockResolvedValue(session)}}}
        }
    };
}

beforeEach(() => {
    mockStartGame.mockClear();
    mockLockChannel.mockClear();
    mockRandomInt.mockClear().mockReturnValue(50);
});

describe('beforeSubcommand', () => {
    test('rejects a member without an admin role', async () => {
        const interaction = makeInteraction({
            roleIds: [],
            adminRoles: ['admin']
        });
        await cmd.beforeSubcommand(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('rejects management in the auto game channel', async () => {
        const interaction = makeInteraction({
            channelEnabled: true,
            channelId: 'game',
            gameChannelId: 'game'
        });
        await cmd.beforeSubcommand(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('gamechannel-modus');
    });

    test('allows an admin in a normal channel (no reply)', async () => {
        const interaction = makeInteraction({roleIds: ['admin']});
        await cmd.beforeSubcommand(interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });
});

describe('end', () => {
    test('reports when no session is running', async () => {
        const interaction = makeInteraction({session: null});
        await cmd.subcommands.end(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('session-not-running');
    });

    test('locks the channel and destroys the session', async () => {
        const session = {destroy: jest.fn().mockResolvedValue()};
        const interaction = makeInteraction({session});
        await cmd.subcommands.end(interaction);
        expect(mockLockChannel).toHaveBeenCalled();
        expect(session.destroy).toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('session-ended-successfully');
    });

    test('does nothing if the interaction was already replied to', async () => {
        const interaction = makeInteraction({replied: true});
        await cmd.subcommands.end(interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });
});

describe('status', () => {
    test('reports when no session is running', async () => {
        const interaction = makeInteraction({session: null});
        await cmd.subcommands.status(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('session-not-running');
    });

    test('prints the running session details', async () => {
        const session = {
            number: 42,
            min: 1,
            max: 100,
            ownerID: 'owner',
            guessCount: 7
        };
        const interaction = makeInteraction({session});
        await cmd.subcommands.status(interaction);
        const content = interaction.reply.mock.calls[0][0].content;
        expect(content).toContain('42');
        expect(content).toContain('<@owner>');
        expect(content).toContain('7');
    });
});

describe('create', () => {
    test('rejects when a session is already running', async () => {
        const interaction = makeInteraction({
            session: {},
            options: {
                min: 1,
                max: 10
            }
        });
        await cmd.subcommands.create(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('session-already-running');
        expect(mockStartGame).not.toHaveBeenCalled();
    });

    test('rejects min >= max', async () => {
        const interaction = makeInteraction({
            session: null,
            options: {
                min: 10,
                max: 5
            }
        });
        await cmd.subcommands.create(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('min-max-discrepancy');
    });

    test('rejects a provided number above the max', async () => {
        const interaction = makeInteraction({
            session: null,
            options: {
                min: 1,
                max: 10,
                number: 99
            }
        });
        await cmd.subcommands.create(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('max-discrepancy');
    });

    test('rejects a provided number below the min', async () => {
        // randomIntFromInterval is only used when number is falsy; provide an explicit low number.
        // number 0 is falsy so create falls back to random; use a number that passes max but fails min via mocked random
        mockRandomInt.mockReturnValue(-5);
        const interaction = makeInteraction({
            session: null,
            options: {
                min: 1,
                max: 10
            }
        });
        await cmd.subcommands.create(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('min-discrepancy');
    });

    test('starts a game with the explicit number', async () => {
        const interaction = makeInteraction({
            session: null,
            options: {
                min: 1,
                max: 100,
                number: 50
            }
        });
        await cmd.subcommands.create(interaction);
        expect(mockStartGame).toHaveBeenCalledWith(interaction.channel, 50, 1, 100, 'u1');
        expect(interaction.reply.mock.calls[0][0].content).toContain('created-successfully');
    });

    test('falls back to a random number when none is provided', async () => {
        mockRandomInt.mockReturnValue(7);
        const interaction = makeInteraction({
            session: null,
            options: {
                min: 1,
                max: 100
            }
        });
        await cmd.subcommands.create(interaction);
        expect(mockRandomInt).toHaveBeenCalledWith(1, 100);
        expect(mockStartGame).toHaveBeenCalledWith(interaction.channel, 7, 1, 100, 'u1');
    });
});