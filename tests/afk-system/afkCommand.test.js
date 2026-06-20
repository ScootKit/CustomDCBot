/*
 * Tests for the /afk command subcommands (commands/afk.js).
 * Covers start (create session, default auto-end true, explicit auto-end false,
 * already-running guard) and end (destroy session, no-session guard).
 */
const afk = require('../../modules/afk-system/commands/afk');

function makeInteraction({
                             session = null,
                             options = {}
                         } = {}) {
    const AFKUser = {
        findOne: jest.fn().mockResolvedValue(session),
        create: jest.fn().mockResolvedValue()
    };
    return {
        user: {id: 'u1'},
        member: {id: 'u1'},
        options: {
            getString: (n) => (n in options ? options[n] : null),
            getBoolean: (n) => (n in options ? options[n] : null)
        },
        client: {
            configurations: {
                'afk-system': {
                    config: {
                        sessionStartedSuccessfully: 'started',
                        sessionEndedSuccessfully: 'ended'
                    }
                }
            },
            models: {'afk-system': {AFKUser}},
            nicknameManager: {
                attachMember: jest.fn(),
                requestUpdate: jest.fn()
            }
        },
        reply: jest.fn().mockResolvedValue()
    };
}

describe('start', () => {
    test('creates a session with the supplied reason', async () => {
        const i = makeInteraction({options: {reason: 'sleeping'}});
        await afk.subcommands.start(i);
        expect(i.client.models['afk-system'].AFKUser.create).toHaveBeenCalledWith(
            expect.objectContaining({
                userID: 'u1',
                afkMessage: 'sleeping',
                autoEnd: true
            })
        );
        expect(i.client.nicknameManager.requestUpdate).toHaveBeenCalledWith('u1');
    });

    test('defaults auto-end to true when the option is omitted', async () => {
        const i = makeInteraction({options: {}});
        await afk.subcommands.start(i);
        expect(i.client.models['afk-system'].AFKUser.create.mock.calls[0][0].autoEnd).toBe(true);
    });

    test('honours an explicit auto-end of false', async () => {
        const i = makeInteraction({options: {'auto-end': false}});
        await afk.subcommands.start(i);
        expect(i.client.models['afk-system'].AFKUser.create.mock.calls[0][0].autoEnd).toBe(false);
    });

    test('refuses to start when a session already exists', async () => {
        const i = makeInteraction({session: {userID: 'u1'}});
        await afk.subcommands.start(i);
        expect(i.client.models['afk-system'].AFKUser.create).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('already-running-session')}));
    });
});

describe('end', () => {
    test('destroys the running session', async () => {
        const session = {destroy: jest.fn().mockResolvedValue()};
        const i = makeInteraction({session});
        await afk.subcommands.end(i);
        expect(session.destroy).toHaveBeenCalled();
        expect(i.client.nicknameManager.requestUpdate).toHaveBeenCalledWith('u1');
    });

    test('reports when there is no running session', async () => {
        const i = makeInteraction({session: null});
        await afk.subcommands.end(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('no-running-session')}));
    });
});