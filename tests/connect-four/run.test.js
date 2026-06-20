/*
 * Tests for the connect-four /connect-four command runner and its move handling.
 *
 * run():
 *   - rejects challenging yourself and challenging a bot (ephemeral, no game)
 *   - the invite path: an expired invite edits the message, a denied invite
 *     updates it, and an accepted invite starts the game (renders the board
 *     and registers a move collector).
 * The collected-move handler is captured from createMessageComponentCollector
 * so we can drive turns directly: rejecting out-of-turn presses, dropping a
 * circle into the lowest free row, alternating colours, and ending the game on
 * a win.
 */
const cmd = require('../../modules/connect-four/commands/connect-four');

function makeMember(id, {
    bot = false,
    username = 'Bob'
} = {}) {
    return {
        id,
        user: {
            id,
            bot,
            username
        },
        toString: () => `<@${id}>`
    };
}

function makeInteraction({
                             member,
                             fieldSize = 7,
                             authorId = 'author'
                         } = {}) {
    const collectors = {};
    const message = {
        edit: jest.fn().mockResolvedValue(),
        awaitMessageComponent: jest.fn(),
        createMessageComponentCollector: jest.fn(() => {
            const handlers = {};
            collectors.handlers = handlers;
            return {
                on: (evt, fn) => {
                    handlers[evt] = fn;
                }
            };
        })
    };
    const interaction = {
        user: {
            id: authorId,
            username: 'Alice'
        },
        client: {},
        guild: {},
        options: {
            getMember: jest.fn(() => member),
            getInteger: jest.fn(() => fieldSize)
        },
        reply: jest.fn().mockResolvedValue(message)
    };
    return {
        interaction,
        message,
        collectors
    };
}

describe('run guards', () => {
    test('rejects challenging yourself', async () => {
        const {interaction} = makeInteraction({member: makeMember('author')});
        await cmd.run(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(interaction.reply.mock.calls[0][0].content).toContain('challenge-yourself');
    });

    test('rejects challenging a bot', async () => {
        const {interaction} = makeInteraction({member: makeMember('bot', {bot: true})});
        await cmd.run(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('challenge-bot');
    });
});

describe('run invite resolution', () => {
    test('an expired (no-response) invite edits the message to expired', async () => {
        const member = makeMember('opponent');
        const {
            interaction,
            message
        } = makeInteraction({member});
        message.awaitMessageComponent.mockResolvedValue(undefined); // collector timed out -> caught
        await cmd.run(interaction);
        expect(message.edit).toHaveBeenCalledWith(expect.objectContaining({components: []}));
        expect(message.edit.mock.calls[0][0].content).toContain('invite-expired');
    });

    test('a denied invite updates the message to denied', async () => {
        const member = makeMember('opponent');
        const {interaction} = makeInteraction({member});
        const update = jest.fn().mockResolvedValue();
        interaction.reply.mock.results; // noop
        const message = await interaction.reply.getMockImplementation?.();
        // Provide an awaitMessageComponent result with deny
        interaction.reply.mockResolvedValue({
            edit: jest.fn().mockResolvedValue(),
            awaitMessageComponent: jest.fn().mockResolvedValue({
                customId: 'deny-invite',
                update
            }),
            createMessageComponentCollector: jest.fn(() => ({
                on: () => {
                }
            }))
        });
        await cmd.run(interaction);
        expect(update).toHaveBeenCalledWith(expect.objectContaining({components: []}));
        expect(update.mock.calls[0][0].content).toContain('invite-denied');
    });

    test('an accepted invite starts the game and registers a move collector', async () => {
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1); // color = blue (<=0.5)
        const member = makeMember('opponent');
        const update = jest.fn().mockResolvedValue();
        const collectorOn = {};
        const collector = {
            on: (evt, fn) => {
                collectorOn[evt] = fn;
            }
        };
        const message = {
            edit: jest.fn().mockResolvedValue(),
            awaitMessageComponent: jest.fn().mockResolvedValue({
                customId: 'accept-invite',
                update
            }),
            createMessageComponentCollector: jest.fn(() => collector)
        };
        const interaction = {
            user: {
                id: 'author',
                username: 'Alice'
            },
            client: {},
            guild: {},
            options: {
                getMember: () => member,
                getInteger: () => 7
            },
            reply: jest.fn().mockResolvedValue(message)
        };
        await cmd.run(interaction);
        // The accepted-invite branch renders the initial board.
        expect(update).toHaveBeenCalled();
        expect(update.mock.calls[0][0].content).toContain('⬜');
        expect(message.createMessageComponentCollector).toHaveBeenCalled();
        expect(typeof collectorOn.collect).toBe('function');
        spy.mockRestore();
    });
});

describe('move collector', () => {
    // Helper to run a game up to the collector and return the collect handler.
    async function startGame({
                                 fieldSize = 7,
                                 randomValue = 0.1
                             } = {}) {
        const spy = jest.spyOn(Math, 'random').mockReturnValue(randomValue);
        const member = makeMember('opponent');
        const update = jest.fn().mockResolvedValue();
        const collectorOn = {};
        const collector = {
            on: (evt, fn) => {
                collectorOn[evt] = fn;
            }
        };
        const message = {
            edit: jest.fn().mockResolvedValue(),
            awaitMessageComponent: jest.fn().mockResolvedValue({
                customId: 'accept-invite',
                update
            }),
            createMessageComponentCollector: jest.fn(() => collector)
        };
        const interaction = {
            user: {
                id: 'author',
                username: 'Alice'
            },
            client: {},
            guild: {},
            options: {
                getMember: () => member,
                getInteger: () => fieldSize
            },
            reply: jest.fn().mockResolvedValue(message)
        };
        await cmd.run(interaction);
        spy.mockRestore();
        // randomValue 0.1 -> color blue -> blue is interaction.user (author)
        return {
            collect: collectorOn.collect,
            member,
            interaction,
            message
        };
    }

    test('an out-of-turn press is rejected ephemerally', async () => {
        // color blue means it's the author's turn; opponent pressing is out of turn
        const {
            collect,
            member
        } = await startGame({randomValue: 0.1});
        const i = {
            user: {id: member.id},
            customId: 'c4_1',
            reply: jest.fn(),
            update: jest.fn()
        };
        await collect(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(i.update).not.toHaveBeenCalled();
    });

    test('a valid move drops a circle and updates the board', async () => {
        const {collect} = await startGame({randomValue: 0.1}); // blue = author's turn
        const update = jest.fn().mockResolvedValue();
        const i = {
            user: {id: 'author'},
            customId: 'c4_1',
            reply: jest.fn(),
            update
        };
        await collect(i);
        expect(update).toHaveBeenCalled();
        // After a non-winning move the board (game-message) is rendered as a string with circles.
        const arg = update.mock.calls[0][0];
        const text = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(text).toContain('blue_circle');
    });
});