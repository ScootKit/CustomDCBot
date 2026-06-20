/*
 * Unit tests for the reload intent-signaling helper extracted from reloadConfig.
 *
 * Per the plan, we test the exported `computeReloadIntentChange(client, modulesDir)`
 * helper directly (with temp-dir fixtures and a fake client that records
 * `logger.warn` calls) instead of running the full `reloadConfig`, which loads all
 * configs and emits events.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {computeReloadIntentChange} = require('../../src/functions/configuration');

function fakeClient(confDir, activeIntents) {
    const logs = {
        warn: [],
        info: [],
        error: []
    };
    return {
        configDir: confDir,
        _activeIntents: activeIntents,
        scnxSetup: false,
        intervals: [],
        jobs: [],
        modules: {},
        botReadyAt: null,
        logger: {
            warn: m => logs.warn.push(m),
            info: m => logs.info.push(m),
            error: m => logs.error.push(m)
        },
        emit: () => {
        },
        logs: logs
    };
}

describe('computeReloadIntentChange', () => {
    function fixture(enabledMap, moduleIntents, activeIntents, customCommands) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reload-'));
        fs.mkdirSync(path.join(root, 'config'));
        fs.mkdirSync(path.join(root, 'modules'));
        for (const [m, intents] of Object.entries(moduleIntents)) {
            fs.mkdirSync(path.join(root, 'modules', m));
            fs.writeFileSync(path.join(root, 'modules', m, 'module.json'), JSON.stringify({intents}));
        }
        fs.writeFileSync(path.join(root, 'config', 'modules.json'), JSON.stringify(enabledMap));
        if (typeof customCommands !== 'undefined') {
            fs.writeFileSync(path.join(root, 'config', 'custom-commands.json'), JSON.stringify(customCommands));
        }
        const client = fakeClient(path.join(root, 'config'), activeIntents);
        return {
            client,
            modulesDir: path.join(root, 'modules')
        };
    }

    test('flags restart when a newly enabled module needs a missing intent', () => {
        const {
            client,
            modulesDir
        } = fixture(
            {mod: true}, {mod: ['GuildMembers']}, ['Guilds']);
        const res = computeReloadIntentChange(client, modulesDir);
        expect(res.requiresRestart).toBe(true);
        expect(res.missingIntents).toContain('GuildMembers');
        expect(client.logs.warn.length).toBeGreaterThan(0);
    });

    test('logWarnings=false computes the same result without logging (fast up-front path)', () => {
        const {
            client,
            modulesDir
        } = fixture(
            {mod: true}, {mod: ['GuildMembers']}, ['Guilds']);
        const res = computeReloadIntentChange(client, modulesDir, false);
        expect(res.requiresRestart).toBe(true);
        expect(res.missingIntents).toContain('GuildMembers');
        expect(client.logs.warn.length).toBe(0);
    });

    test('no restart when required intents are already active', () => {
        const {
            client,
            modulesDir
        } = fixture(
            {mod: true}, {mod: ['GuildMembers']}, ['Guilds', 'GuildMembers']);
        const res = computeReloadIntentChange(client, modulesDir);
        expect(res.requiresRestart).toBe(false);
        expect(res.missingIntents).toEqual([]);
        expect(client.logs.warn.length).toBe(0);
    });

    test('flags restart when a newly added MESSAGE custom command needs content intents', () => {
        const {
            client,
            modulesDir
        } = fixture(
            {}, {}, ['Guilds'], [{
                type: 'MESSAGE',
                enabled: true,
                matchType: 'contains',
                matchString: 'hi'
            }]);
        const res = computeReloadIntentChange(client, modulesDir);
        expect(res.requiresRestart).toBe(true);
        expect(res.missingIntents).toEqual(expect.arrayContaining(['GuildMessages', 'MessageContent']));
    });

    test('warns (does not throw) when a reloaded module declares an unknown intent', () => {
        const {
            client,
            modulesDir
        } = fixture(
            {mod: true}, {mod: ['Bogus']}, ['Guilds']);
        const res = computeReloadIntentChange(client, modulesDir);
        expect(res.requiresRestart).toBe(false);
        expect(client.logs.warn.some(m => /Bogus/.test(m))).toBe(true);
    });
});