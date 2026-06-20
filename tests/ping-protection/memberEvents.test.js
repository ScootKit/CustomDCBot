/*
 * Tests for ping-protection's guildMemberAdd / guildMemberRemove handlers.
 *
 * Remove: with leaver retention enabled -> markUserAsLeft; otherwise -> wipe data.
 * Add: rejoin clears the leaver flag. Both guard on botReady + matching guild.
 */
const mockMarkLeft = jest.fn().mockResolvedValue();
const mockMarkRejoined = jest.fn().mockResolvedValue();
const mockDeleteAll = jest.fn().mockResolvedValue();
jest.mock('../../modules/ping-protection/ping-protection', () => ({
    markUserAsLeft: (...a) => mockMarkLeft(...a),
    markUserAsRejoined: (...a) => mockMarkRejoined(...a),
    deleteAllUserData: (...a) => mockDeleteAll(...a)
}));

const addHandler = require('../../modules/ping-protection/events/guildMemberAdd');
const removeHandler = require('../../modules/ping-protection/events/guildMemberRemove');

function makeClient({
                        ready = true,
                        storage = {}
                    } = {}) {
    return {
        botReadyAt: ready ? Date.now() : undefined,
        guildID: 'g1',
        configurations: {'ping-protection': {storage}}
    };
}

function makeMember(guildID = 'g1', id = 'u1') {
    return {
        id,
        guild: {id: guildID}
    };
}

beforeEach(() => {
    mockMarkLeft.mockClear();
    mockMarkRejoined.mockClear();
    mockDeleteAll.mockClear();
});

describe('guildMemberRemove', () => {
    test('marks the user as left when leaver retention is enabled', async () => {
        const client = makeClient({storage: {enableLeaverDataRetention: true}});
        await removeHandler.run(client, makeMember());
        expect(mockMarkLeft).toHaveBeenCalledWith(client, 'u1');
        expect(mockDeleteAll).not.toHaveBeenCalled();
    });

    test('deletes all data when leaver retention is disabled', async () => {
        const client = makeClient({storage: {enableLeaverDataRetention: false}});
        await removeHandler.run(client, makeMember());
        expect(mockDeleteAll).toHaveBeenCalledWith(client, 'u1');
        expect(mockMarkLeft).not.toHaveBeenCalled();
    });

    test('ignores other guilds and pre-ready events', async () => {
        await removeHandler.run(makeClient({
            ready: false,
            storage: {}
        }), makeMember());
        await removeHandler.run(makeClient({storage: {}}), makeMember('other'));
        expect(mockMarkLeft).not.toHaveBeenCalled();
        expect(mockDeleteAll).not.toHaveBeenCalled();
    });
});

describe('guildMemberAdd', () => {
    test('clears the leaver flag on rejoin', async () => {
        const client = makeClient();
        await addHandler.run(client, makeMember());
        expect(mockMarkRejoined).toHaveBeenCalledWith(client, 'u1');
    });

    test('ignores other guilds and pre-ready events', async () => {
        await addHandler.run(makeClient({ready: false}), makeMember());
        await addHandler.run(makeClient(), makeMember('other'));
        expect(mockMarkRejoined).not.toHaveBeenCalled();
    });
});