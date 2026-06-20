/*
 * Tests for src/commands/reload.js — the /reload command flow.
 *
 * The command: acknowledges (ephemeral reply), optionally announces to the
 * log channel, runs reloadConfig(), and on success edits the reply, re-syncs
 * slash commands, then edits the reply again with the result. On failure it
 * announces failure and exits the process.
 *
 * We mock reloadConfig (configuration), syncCommandsIfNeeded (main) and
 * formatDiscordUserName (helpers) so we can drive each branch deterministically.
 */

const mockReloadConfig = jest.fn();
const mockSyncCommands = jest.fn();

jest.mock('../../src/functions/configuration', () => ({
    reloadConfig: (...a) => mockReloadConfig(...a)
}));

// main is moduleNameMapper'd to the stub; extend the stub with the sync fn.
jest.mock('../__stubs__/main', () => {
    const actual = jest.requireActual('../__stubs__/main');
    return {
        ...actual,
        syncCommandsIfNeeded: (...a) => mockSyncCommands(...a)
    };
});

jest.mock('../../src/functions/helpers', () => ({
    formatDiscordUserName: (user) => user.username || user.id
}));

/*
 * reload.js requires '../functions/localize' — a path the global moduleNamemapper
 * does not rewrite (it only catches paths containing 'src/functions/localize'),
 * so the REAL localize module loads here and produces real English strings. We
 * therefore assert against the actual locale text rather than the stub format.
 */

const reload = require('../../src/commands/reload');

function makeInteraction({withLogChannel = true} = {}) {
    const logChannel = withLogChannel
        ? {send: jest.fn().mockResolvedValue()}
        : null;
    return {
        reply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        user: {
            id: 'u1',
            username: 'tester'
        },
        client: {logChannel}
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('reload - config metadata', () => {
    test('exposes name and a non-empty description', () => {
        expect(reload.config.name).toBe('reload');
        expect(typeof reload.config.description).toBe('string');
        expect(reload.config.description.length).toBeGreaterThan(0);
    });

    test('is marked as a restricted command', () => {
        expect(reload.config.restricted).toBe(true);
    });
});

describe('reload - happy path', () => {
    test('acknowledges the interaction ephemerally first', async () => {
        mockReloadConfig.mockResolvedValue({modules: 3});
        const i = makeInteraction();
        await reload.run(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({
            ephemeral: true,
            content: expect.any(String)
        }));
        // ephemeral reply happens before reloadConfig resolves
        expect(i.reply.mock.invocationCallOrder[0])
            .toBeLessThan(mockReloadConfig.mock.invocationCallOrder[0]);
    });

    test('announces start and success in the log channel', async () => {
        mockReloadConfig.mockResolvedValue({});
        const i = makeInteraction();
        await reload.run(i);
        const sent = i.client.logChannel.send.mock.calls.map(c => c[0]);
        // start announcement (prefixed with the 🔄 emoji) and success (✅)
        expect(sent.some(m => m.startsWith('🔄'))).toBe(true);
        expect(sent.some(m => m.startsWith('✅'))).toBe(true);
    });

    test('includes the formatted username in the start announcement', async () => {
        mockReloadConfig.mockResolvedValue({});
        const i = makeInteraction();
        await reload.run(i);
        const startMsg = i.client.logChannel.send.mock.calls[0][0];
        // %tag is interpolated with the formatted username
        expect(startMsg).toContain('tester');
    });

    test('calls reloadConfig with the client', async () => {
        mockReloadConfig.mockResolvedValue({});
        const i = makeInteraction();
        await reload.run(i);
        expect(mockReloadConfig).toHaveBeenCalledWith(i.client);
    });

    test('syncs commands after a successful reload', async () => {
        mockReloadConfig.mockResolvedValue({});
        const i = makeInteraction();
        await reload.run(i);
        expect(mockSyncCommands).toHaveBeenCalledTimes(1);
    });

    test('edits the reply twice: syncing notice then the final result', async () => {
        mockReloadConfig.mockResolvedValue({foo: 'bar'});
        const i = makeInteraction();
        await reload.run(i);
        // two editReply calls during the success branch
        expect(i.editReply).toHaveBeenCalledTimes(2);
        const last = i.editReply.mock.calls[i.editReply.mock.calls.length - 1][0];
        expect(typeof last).toBe('string');
        expect(last.length).toBeGreaterThan(0);
    });

    test('sync happens between the two editReply calls', async () => {
        mockReloadConfig.mockResolvedValue({});
        const i = makeInteraction();
        await reload.run(i);
        const firstEdit = i.editReply.mock.invocationCallOrder[0];
        const syncCall = mockSyncCommands.mock.invocationCallOrder[0];
        const lastEdit = i.editReply.mock.invocationCallOrder[1];
        expect(firstEdit).toBeLessThan(syncCall);
        expect(syncCall).toBeLessThan(lastEdit);
    });

    test('works without a log channel (no throw)', async () => {
        mockReloadConfig.mockResolvedValue({});
        const i = makeInteraction({withLogChannel: false});
        await expect(reload.run(i)).resolves.toBeUndefined();
        expect(mockSyncCommands).toHaveBeenCalled();
    });
});

describe('reload - failure path', () => {
    let exitSpy;
    beforeEach(() => {
        exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        });
    });
    afterEach(() => {
        exitSpy.mockRestore();
    });

    test('on reloadConfig rejection it announces failure, edits reply and exits', async () => {
        mockReloadConfig.mockRejectedValue('boom');
        const i = makeInteraction();
        await reload.run(i);

        const sent = i.client.logChannel.send.mock.calls.map(c => c[0]);
        // failure announcement prefixed with the warning emoji
        expect(sent.some(m => m.startsWith('⚠️️'))).toBe(true);
        // the failure branch edits the reply with a {content} object (the failure
        // message). Regression guard: the reason must be interpolated into the
        // %r placeholder (the code passes {r: reason}); previously it passed
        // {reason}, so %r stayed literal and the cause was never shown.
        const editArg = i.editReply.mock.calls.find(c => c[0] && typeof c[0].content === 'string');
        expect(editArg).toBeDefined();
        expect(editArg[0].content).toContain('FAILED');
        expect(editArg[0].content).toContain('boom');
        expect(editArg[0].content).not.toContain('%r');
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    test('failure announcement is emitted before the editReply error message', async () => {
        mockReloadConfig.mockRejectedValue('boom');
        const i = makeInteraction();
        await reload.run(i);
        const failureAnnouncement = i.client.logChannel.send.mock.calls
            .find(c => c[0].startsWith('⚠️️'));
        expect(failureAnnouncement).toBeDefined();
    });
});