/*
 * Tests for the home-guild lifecycle event handlers:
 *   guildAvailable.js    - marks the bot ready once the home guild becomes available
 *   guildUnavailable.js  - clears readiness + reports a core issue (scnx) on outage
 *   guildDelete.js       - the bot was kicked: report/exit, teardown, rejoin listener
 *
 * scnx-integration and configuration are mocked inline; localize is the real module
 * (the handlers require it via '../functions/localize', which jest.config's
 * moduleNameMapper does not redirect), so we assert on behavior rather than exact text.
 */

jest.mock('../../src/functions/scnx-integration', () => ({
    reportIssue: jest.fn().mockResolvedValue()
}), {virtual: true});
jest.mock('../../src/functions/configuration', () => ({
    reloadConfig: jest.fn().mockResolvedValue()
}));

const EventEmitter = require('events');
const scnx = require('../../src/functions/scnx-integration');
const configuration = require('../../src/functions/configuration');

const guildAvailable = require('../../src/events/guildAvailable');
const guildUnavailable = require('../../src/events/guildUnavailable');
const guildDelete = require('../../src/events/guildDelete');

/**
 * Builds an EventEmitter-based client stub with the surface the lifecycle handlers touch.
 * @param {Object} [over]
 * @returns {Object}
 */
function makeClient(over = {}) {
    const client = new EventEmitter();
    Object.assign(client, {
        config: {guildID: 'home'},
        botReadyAt: null,
        scnxSetup: false,
        guild: null,
        intervals: [],
        jobs: [],
        user: {id: 'bot1'},
        sanitizePath: (s) => s,
        logger: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            fatal: jest.fn(),
            debug: jest.fn()
        }
    });
    return Object.assign(client, over);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('guildAvailable', () => {
    test('marks the bot ready and stores the guild for the home guild', async () => {
        const client = makeClient();
        const guild = {id: 'home'};
        await guildAvailable.run(client, guild);
        expect(client.guild).toBe(guild);
        expect(client.botReadyAt).toBeInstanceOf(Date);
        expect(client.logger.info).toHaveBeenCalled();
    });

    test('ignores guilds other than the configured home guild', async () => {
        const client = makeClient();
        await guildAvailable.run(client, {id: 'other'});
        expect(client.guild).toBe(null);
        expect(client.botReadyAt).toBe(null);
    });

    test('no-ops when the bot is already ready (does not re-store guild)', async () => {
        const already = new Date(0);
        const client = makeClient({botReadyAt: already});
        await guildAvailable.run(client, {id: 'home'});
        expect(client.botReadyAt).toBe(already);
        expect(client.guild).toBe(null);
    });

    test('ignoreBotReadyCheck flag is exported', () => {
        expect(guildAvailable.ignoreBotReadyCheck).toBe(true);
    });
});

describe('guildUnavailable', () => {
    test('clears readiness when the home guild goes unavailable', async () => {
        const client = makeClient({botReadyAt: new Date()});
        await guildUnavailable.run(client, {id: 'home'});
        expect(client.botReadyAt).toBe(null);
        expect(client.logger.warn).toHaveBeenCalled();
    });

    test('ignores non-home guilds', async () => {
        const ready = new Date();
        const client = makeClient({botReadyAt: ready});
        await guildUnavailable.run(client, {id: 'other'});
        expect(client.botReadyAt).toBe(ready);
    });

    test('no-ops when the bot was never ready', async () => {
        const client = makeClient({botReadyAt: null});
        await guildUnavailable.run(client, {id: 'home'});
        expect(scnx.reportIssue).not.toHaveBeenCalled();
    });

    test('reports a CORE_ISSUE via scnx integration when scnxSetup is on', async () => {
        const client = makeClient({
            botReadyAt: new Date(),
            scnxSetup: true
        });
        await guildUnavailable.run(client, {id: 'home'});
        expect(scnx.reportIssue).toHaveBeenCalledWith(client, {
            type: 'CORE_ISSUE',
            errorDescription: 'home_guild_unavailable'
        });
    });

    test('does not report when scnxSetup is off', async () => {
        const client = makeClient({
            botReadyAt: new Date(),
            scnxSetup: false
        });
        await guildUnavailable.run(client, {id: 'home'});
        expect(scnx.reportIssue).not.toHaveBeenCalled();
    });
});

describe('guildDelete', () => {
    let exitSpy;
    beforeEach(() => {
        exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        });
    });
    afterEach(() => {
        exitSpy.mockRestore();
    });

    test('ignores non-home guilds', async () => {
        const client = makeClient();
        await guildDelete.run(client, {id: 'other'});
        expect(client.logger.error).not.toHaveBeenCalled();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    test('non-scnx setup logs fatal and exits the process', async () => {
        const client = makeClient({scnxSetup: false});
        await guildDelete.run(client, {id: 'home'});
        expect(client.logger.fatal).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
        // Teardown is short-circuited by the early process.exit return.
        expect(scnx.reportIssue).not.toHaveBeenCalled();
    });

    test('scnx setup reports a CORE_FAILURE with an invite URL containing the bot + guild ids', async () => {
        const client = makeClient({
            scnxSetup: true,
            intervals: [],
            jobs: []
        });
        await guildDelete.run(client, {id: 'home'});
        expect(scnx.reportIssue).toHaveBeenCalledWith(client, expect.objectContaining({
            type: 'CORE_FAILURE',
            errorDescription: 'bot_not_on_guild'
        }));
        const url = scnx.reportIssue.mock.calls[0][1].errorData.inviteURL;
        expect(url).toContain('client_id=bot1');
        expect(url).toContain('guild_id=home');
        expect(exitSpy).not.toHaveBeenCalled();
    });

    test('scnx teardown clears readiness, intervals, jobs and guild reference', async () => {
        const clearInt = jest.fn();
        const cancel = jest.fn();
        const client = makeClient({
            scnxSetup: true,
            botReadyAt: new Date(),
            intervals: [101, 202],
            jobs: [{cancel}, null, {cancel}]
        });
        const realClear = global.clearInterval;
        global.clearInterval = clearInt;
        const reloadSpy = jest.fn();
        client.on('configReload', reloadSpy);
        try {
            await guildDelete.run(client, {id: 'home'});
        } finally {
            global.clearInterval = realClear;
        }
        expect(client.botReadyAt).toBe(null);
        expect(reloadSpy).toHaveBeenCalled();
        expect(clearInt).toHaveBeenCalledTimes(2);
        expect(client.intervals).toEqual([]);
        // null jobs are filtered out; only the two real jobs are cancelled.
        expect(cancel).toHaveBeenCalledTimes(2);
        expect(client.jobs).toEqual([]);
        expect(client.guild).toBe(null);
    });

    test('a guildCreate rejoin listener is registered and reloads config on home rejoin', async () => {
        const client = makeClient({scnxSetup: true});
        await guildDelete.run(client, {id: 'home'});
        expect(client.listenerCount('guildCreate')).toBe(1);

        const newGuild = {id: 'home'};
        client.emit('guildCreate', newGuild);
        await new Promise(setImmediate);

        expect(client.guild).toBe(newGuild);
        expect(configuration.reloadConfig).toHaveBeenCalledWith(client);
        // Listener removes itself after the home guild rejoins.
        expect(client.listenerCount('guildCreate')).toBe(0);
    });

    test('rejoin listener ignores guildCreate for non-home guilds', async () => {
        const client = makeClient({scnxSetup: true});
        await guildDelete.run(client, {id: 'home'});

        client.emit('guildCreate', {id: 'other'});
        await new Promise(setImmediate);

        expect(configuration.reloadConfig).not.toHaveBeenCalled();
        // Listener stays registered, still waiting for the home guild.
        expect(client.listenerCount('guildCreate')).toBe(1);
    });

    test('rejoin reloadConfig failure logs fatal and exits', async () => {
        configuration.reloadConfig.mockRejectedValueOnce(new Error('bad config'));
        const client = makeClient({scnxSetup: true});
        await guildDelete.run(client, {id: 'home'});

        client.emit('guildCreate', {id: 'home'});
        await new Promise(setImmediate);
        await new Promise(setImmediate);

        expect(client.logger.fatal).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    test('ignoreBotReadyCheck flag is exported', () => {
        expect(guildDelete.ignoreBotReadyCheck).toBe(true);
    });
});