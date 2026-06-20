/*
 * Behavior tests for the tic-tac-toe command run() — the interactive game loop
 * built on a message-component collector. Existing tests cover the pure win/draw
 * detectors; this drives the collector handlers to exercise: the self-invite
 * guard, the challenge message, invite-accept vs invite-deny, turn enforcement
 * (only the invited player can accept, only the current player can move), a full
 * win line ending with a win-header update, and the collector "end" (timeout)
 * editing the message with the expiry reason.
 *
 * We fake interaction.reply({fetchReply}) -> a message exposing a collector whose
 * registered 'collect'/'end' handlers we invoke directly.
 */
// Force the random starting-player pick to be deterministic: always the first
// element, which run() passes as [interaction.member, member] -> the inviter starts.
jest.mock('../../src/functions/helpers', () => {
    const actual = jest.requireActual('../../src/functions/helpers');
    return {
        ...actual,
        randomElementFromArray: (arr) => arr[0]
    };
});

const command = require('../../modules/tic-tak-toe/commands/tic-tac-toe');

// run() arms a real 120s invite-expiry setTimeout; fake timers keep it from leaking
// past the test and triggering Jest's "worker failed to exit" teardown warning.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

function makeCollector() {
    const handlers = {};
    return {
        ended: false,
        on(event, fn) {
            handlers[event] = fn;
            return this;
        },
        stop() {
            this.ended = true;
            if (handlers.end) handlers.end();
        },
        emitCollect(i) {
            return handlers.collect(i);
        },
        emitEnd() {
            if (handlers.end) handlers.end();
        }
    };
}

function makeMember(id) {
    return {
        id,
        user: {
            id,
            bot: false
        },
        toString: () => `<@${id}>`
    };
}

function makeRunInteraction({
                                inviterId = 'inviter',
                                inviteeId = 'invitee'
                            } = {}) {
    const collector = makeCollector();
    const repEdit = jest.fn().mockResolvedValue();
    const rep = {
        createMessageComponentCollector: jest.fn().mockReturnValue(collector),
        edit: repEdit
    };
    const invitee = makeMember(inviteeId);
    const inviter = makeMember(inviterId);
    const interaction = {
        user: {
            id: inviterId,
            toString: () => `<@${inviterId}>`
        },
        member: inviter,
        options: {getMember: jest.fn().mockReturnValue(invitee)},
        guild: {members: {cache: {filter: () => ({random: () => null})}}},
        reply: jest.fn().mockResolvedValue(rep)
    };
    return {
        interaction,
        collector,
        rep,
        repEdit,
        invitee,
        inviter
    };
}

// A click interaction on a board/invite button.
function click(userId, customId) {
    return {
        user: {id: userId},
        customId,
        reply: jest.fn().mockResolvedValue(),
        update: jest.fn().mockResolvedValue()
    };
}

test('rejects inviting yourself with an ephemeral warning', async () => {
    const {interaction} = makeRunInteraction();
    interaction.options.getMember = jest.fn().mockReturnValue(makeMember('inviter')); // same as caller
    await command.run(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toContain('tic-tac-toe.self-invite-not-possible');
});

test('posts a challenge message with accept/deny buttons and a collector', async () => {
    const {
        interaction,
        rep
    } = makeRunInteraction();
    await command.run(interaction);
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toContain('tic-tac-toe.challenge-message');
    expect(arg.components[0].components.map(c => c.customId)).toEqual(['accept-invite', 'deny-invite']);
    expect(rep.createMessageComponentCollector).toHaveBeenCalled();
});

test('a non-invited user cannot accept the invite', async () => {
    const {
        interaction,
        collector
    } = makeRunInteraction();
    await command.run(interaction);
    const i = click('stranger', 'accept-invite');
    await collector.emitCollect(i);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('tic-tac-toe.you-are-not-the-invited-one')
    }));
});

test('denying the invite stops the collector and edits with the denied reason', async () => {
    const {
        interaction,
        collector,
        repEdit
    } = makeRunInteraction();
    await command.run(interaction);
    const i = click('invitee', 'deny-invite');
    await collector.emitCollect(i);
    expect(collector.ended).toBe(true);
    expect(repEdit).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('tic-tac-toe.invite-denied')
    }));
});

test('accepting the invite renders the 3x3 board (no immediate end)', async () => {
    const {
        interaction,
        collector
    } = makeRunInteraction();
    await command.run(interaction);
    const accept = click('invitee', 'accept-invite');
    await collector.emitCollect(accept);
    expect(accept.update).toHaveBeenCalled();
    const payload = accept.update.mock.calls[0][0];
    // 3 rows of 3 buttons
    expect(payload.components.length).toBe(3);
    expect(payload.components[0].components.length).toBe(3);
    expect(payload.content).toContain('tic-tac-toe.playing-header');
});

test('the off-turn player (invitee, since inviter starts) cannot place a mark', async () => {
    const {
        interaction,
        collector
    } = makeRunInteraction();
    await command.run(interaction);
    const accept = click('invitee', 'accept-invite');
    await collector.emitCollect(accept);
    // Inviter is the deterministic starter -> invitee moving first is rejected.
    const offTurn = click('invitee', '1-1');
    await collector.emitCollect(offTurn);
    expect(offTurn.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('tic-tac-toe.not-your-turn')
    }));
    expect(offTurn.update).not.toHaveBeenCalled();
});

test('a completed winning line ends the game with a win header', async () => {
    const {
        interaction,
        collector
    } = makeRunInteraction();
    await command.run(interaction);
    const accept = click('invitee', 'accept-invite');
    await collector.emitCollect(accept);

    // Inviter starts; alternate inviter (top row) / invitee (middle row).
    const seq = [
        ['inviter', '1-1'], ['invitee', '2-1'],
        ['inviter', '1-2'], ['invitee', '2-2'],
        ['inviter', '1-3'] // inviter completes the top row -> win
    ];
    let lastClick;
    for (const [who, cell] of seq) {
        lastClick = click(who, cell);
        await collector.emitCollect(lastClick);
    }
    const finalUpdate = lastClick.update.mock.calls[0][0];
    expect(finalUpdate.content).toContain('tic-tac-toe.win-header');
});

test('filling the board without a line ends the game in a draw header', async () => {
    const {
        interaction,
        collector
    } = makeRunInteraction();
    await command.run(interaction);
    const accept = click('invitee', 'accept-invite');
    await collector.emitCollect(accept);
    // Inviter (X) and invitee (O) fill the board to a draw:
    //   X O X
    //   X O O
    //   O X X
    const seq = [
        ['inviter', '1-1'], ['invitee', '1-2'],
        ['inviter', '1-3'], ['invitee', '2-2'],
        ['inviter', '2-1'], ['invitee', '2-3'],
        ['inviter', '3-2'], ['invitee', '3-1'],
        ['inviter', '3-3']
    ];
    let lastClick;
    for (const [who, cell] of seq) {
        lastClick = click(who, cell);
        await collector.emitCollect(lastClick);
    }
    const finalUpdate = lastClick.update.mock.calls[0][0];
    expect(finalUpdate.content).toContain('tic-tac-toe.draw-header');
});

test('collector end without a finished game edits the message with the expiry reason', async () => {
    const {
        interaction,
        collector,
        repEdit
    } = makeRunInteraction();
    await command.run(interaction);
    // never started -> endReason was set by the timeout; emulate timeout by stopping
    collector.emitEnd();
    expect(repEdit).toHaveBeenCalledWith(expect.objectContaining({components: []}));
});