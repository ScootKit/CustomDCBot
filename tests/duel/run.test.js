/*
 * Tests for the duel /duel command runner (commands/duel.js) and its in-game
 * button collector.
 *
 * run():
 *   - rejects challenging yourself (ephemeral, suggests a random online member)
 *   - posts the invite with accept/deny buttons
 * collector:
 *   - a non-invited user pressing accept is rejected
 *   - denying the invite stops the collector with a denied reason
 *   - accepting starts the game
 *   - bullet bookkeeping: reload increments bullets (capped at 5), firing a gun
 *     with no bullets is rejected, and a reload then gun resolves a round that
 *     ends the game (reload-vs-gun).
 */
const cmd = require('../../modules/duel/commands/duel');

// The runner arms a 120s invite-expiry setTimeout; fake timers keep that from
// leaking a live handle past the test run.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

function makeMember(id) {
    return {
        id,
        user: {
            id,
            username: `user-${id}`
        },
        toString: () => `<@${id}>`
    };
}

function makeRunContext({
                            memberId = 'opp',
                            authorId = 'author'
                        } = {}) {
    const member = makeMember(memberId);
    const collectorHandlers = {};
    const collector = {
        ended: false,
        on: (evt, fn) => {
            collectorHandlers[evt] = fn;
        },
        stop: jest.fn()
    };
    const rep = {
        createMessageComponentCollector: jest.fn(() => collector),
        edit: jest.fn().mockResolvedValue()
    };
    const interaction = {
        user: {
            id: authorId,
            username: 'Author',
            toString: () => `<@${authorId}>`
        },
        client: {},
        guild: {members: {cache: {filter: () => ({random: () => makeMember('rnd')})}}},
        options: {getMember: jest.fn(() => member)},
        reply: jest.fn().mockResolvedValue(rep)
    };
    return {
        interaction,
        member,
        rep,
        collector,
        collectorHandlers
    };
}

describe('run', () => {
    test('rejects challenging yourself with a random suggestion', async () => {
        const {interaction} = makeRunContext({
            memberId: 'author',
            authorId: 'author'
        });
        await cmd.run(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(interaction.reply.mock.calls[0][0].content).toContain('self-invite-not-possible');
    });

    test('posts the invite and registers a collector', async () => {
        const {
            interaction,
            rep,
            collectorHandlers
        } = makeRunContext();
        await cmd.run(interaction);
        expect(rep.createMessageComponentCollector).toHaveBeenCalled();
        expect(typeof collectorHandlers.collect).toBe('function');
        // The invite carries accept/deny buttons.
        const replyArg = interaction.reply.mock.calls[0][0];
        const ids = replyArg.components[0].components.map(c => c.customId);
        expect(ids).toEqual(expect.arrayContaining(['duel-accept-invite', 'duel-deny-invite']));
    });
});

describe('collector invite handling', () => {
    test('rejects an accept press from someone who is not the invited user', async () => {
        const {
            interaction,
            collectorHandlers
        } = makeRunContext({memberId: 'opp'});
        await cmd.run(interaction);
        const i = {
            user: {id: 'stranger'},
            customId: 'duel-accept-invite',
            reply: jest.fn()
        };
        await collectorHandlers.collect(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('denying the invite stops the collector', async () => {
        const {
            interaction,
            collector,
            collectorHandlers
        } = makeRunContext({memberId: 'opp'});
        await cmd.run(interaction);
        const i = {
            user: {id: 'opp'},
            customId: 'duel-deny-invite',
            reply: jest.fn(),
            update: jest.fn()
        };
        await collectorHandlers.collect(i);
        expect(collector.stop).toHaveBeenCalled();
    });
});

describe('collector gameplay', () => {
    async function startedGame() {
        const ctx = makeRunContext({
            memberId: 'opp',
            authorId: 'author'
        });
        await cmd.run(ctx.interaction);
        // Accept the invite as the invited member to flip `started` true.
        const accept = {
            user: {id: 'opp'},
            customId: 'duel-accept-invite',
            reply: jest.fn(),
            update: jest.fn().mockResolvedValue()
        };
        await ctx.collectorHandlers.collect(accept);
        return ctx;
    }

    function press(userId, action) {
        return {
            user: {id: userId},
            customId: `duel-${action}`,
            reply: jest.fn(),
            update: jest.fn().mockResolvedValue()
        };
    }

    test('firing a gun with no bullets is rejected', async () => {
        const {collectorHandlers} = await startedGame();
        const i = press('author', 'gun');
        await collectorHandlers.collect(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(i.reply.mock.calls[0][0].content).toContain('no-bullets');
    });

    test('a stranger cannot play once the game is running', async () => {
        const {collectorHandlers} = await startedGame();
        const i = press('stranger', 'reload');
        await collectorHandlers.collect(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(i.reply.mock.calls[0][0].content).toContain('not-your-game');
    });

    test('reload then opponent gun resolves a round that ends the game', async () => {
        const {collectorHandlers} = await startedGame();
        // author reloads (gains a bullet), updates board
        await collectorHandlers.collect(press('author', 'reload'));
        // opponent reloads to gain a bullet too
        await collectorHandlers.collect(press('opp', 'reload'));
        // Now both have answered the first round (reload/reload). Start round 2:
        // author reloads again, opponent fires -> reload-gun ends the game.
        await collectorHandlers.collect(press('author', 'reload'));
        const finisher = press('opp', 'gun');
        await collectorHandlers.collect(finisher);
        // The finishing update marks the game ended (content 'GGs!').
        expect(finisher.update).toHaveBeenCalled();
        const lastUpdate = finisher.update.mock.calls[finisher.update.mock.calls.length - 1][0];
        expect(lastUpdate.content).toBe('GGs!');
    });
});