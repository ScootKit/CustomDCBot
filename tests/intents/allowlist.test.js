const fs = require('fs');
const os = require('os');
const path = require('path');
const {computeRequiredIntents, partitionAllowlist, readAllowedPrivilegedIntents, privilegedIntentUsage} = require('../../src/functions/intents');

function fixture({modules = {}, enabled = {}, allowlist, customCommands} = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allowlist-'));
    fs.mkdirSync(path.join(root, 'config'));
    fs.mkdirSync(path.join(root, 'modules'));
    for (const [m, json] of Object.entries(modules)) {
        fs.mkdirSync(path.join(root, 'modules', m));
        fs.writeFileSync(path.join(root, 'modules', m, 'module.json'), JSON.stringify(json));
    }
    fs.writeFileSync(path.join(root, 'config', 'modules.json'), JSON.stringify(enabled));
    const config = {};
    if (typeof allowlist !== 'undefined') config.allowedPrivilegedIntents = allowlist;
    fs.writeFileSync(path.join(root, 'config', 'config.json'), JSON.stringify(config));
    if (customCommands) fs.writeFileSync(path.join(root, 'config', 'custom-commands.json'), JSON.stringify(customCommands));
    return {confDir: path.join(root, 'config'), modulesDir: path.join(root, 'modules')};
}

describe('partitionAllowlist', () => {
    test('splits valid privileged names from invalid/non-privileged ones and dedupes', () => {
        const {allowed, bad} = partitionAllowlist(['GuildMembers', 'GuildMembers', 'Guilds', 'Bogus']);
        expect(allowed).toEqual(['GuildMembers']);
        expect(bad).toEqual(['Guilds', 'Bogus']);
    });

    test('tolerates a non-array argument', () => {
        expect(partitionAllowlist(undefined)).toEqual({allowed: [], bad: []});
    });
});

describe('computeRequiredIntents allowlist', () => {
    const modA = {intents: ['GuildPresences'], optionalIntents: ['GuildPresences']}; // cosmetic presence
    const statusRoles = {intents: ['GuildPresences']}; // required (no optionalIntents)

    test('empty allowlist = all allowed: no disables/degrades/drops, presence still requested', () => {
        const {confDir, modulesDir} = fixture({
            modules: {a: modA, sr: statusRoles}, enabled: {a: true, sr: true}, allowlist: []
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.names).toContain('GuildPresences');
        expect(r.disabledModules).toEqual([]);
        expect(r.degradedModules).toEqual([]);
        expect(r.droppedPrivileged).toEqual([]);
        expect(r.badAllowlistEntries).toEqual([]);
    });

    test('absent config.json = all allowed (no crash)', () => {
        const {confDir, modulesDir} = fixture({modules: {sr: statusRoles}, enabled: {sr: true}});
        fs.rmSync(path.join(confDir, 'config.json'));
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.names).toContain('GuildPresences');
        expect(r.allowedPrivileged).toEqual([]);
    });

    test('allowlist without GuildPresences: required consumer disabled, optional consumer degraded, intent dropped', () => {
        const {confDir, modulesDir} = fixture({
            modules: {a: modA, sr: statusRoles},
            enabled: {a: true, sr: true},
            allowlist: ['GuildMembers', 'MessageContent']
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.names).not.toContain('GuildPresences');
        expect(r.droppedPrivileged).toEqual(['GuildPresences']);
        expect(r.disabledModules).toEqual([{module: 'sr', missingRequired: ['GuildPresences']}]);
        expect(r.degradedModules).toEqual([{module: 'a', missingOptional: ['GuildPresences']}]);
    });

    test('intent required by one active module and optional in another is still requested; optional module not degraded', () => {
        const req = {intents: ['GuildMembers']};                 // required
        const opt = {intents: ['GuildMembers'], optionalIntents: ['GuildMembers']}; // optional
        const {confDir, modulesDir} = fixture({
            modules: {req, opt}, enabled: {req: true, opt: true}, allowlist: ['GuildMembers']
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.names).toContain('GuildMembers');
        expect(r.disabledModules).toEqual([]);
        expect(r.degradedModules).toEqual([]);
    });

    test('non-privileged intents never gated', () => {
        const {confDir, modulesDir} = fixture({
            modules: {m: {intents: ['GuildVoiceStates']}}, enabled: {m: true}, allowlist: ['GuildMembers']
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.names).toContain('GuildVoiceStates');
        expect(r.disabledModules).toEqual([]);
    });

    test('invalid allowlist entries reported and (when all-invalid) treated as all-allowed', () => {
        const {confDir, modulesDir} = fixture({
            modules: {sr: statusRoles}, enabled: {sr: true}, allowlist: ['Bogus', 'Guilds']
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.badAllowlistEntries).toEqual(['Bogus', 'Guilds']);
        expect(r.names).toContain('GuildPresences'); // all-invalid => fail open to all-allowed
        expect(r.disabledModules).toEqual([]);
    });

    test('module with optionalIntents but no intents is tolerated', () => {
        const {confDir, modulesDir} = fixture({
            modules: {m: {optionalIntents: ['GuildMembers']}}, enabled: {m: true}, allowlist: ['MessageContent']
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.disabledModules).toEqual([]);
        expect(r.degradedModules).toEqual([]);
    });

    test('MessageContent needed by a custom command but not allowed is dropped (no crash)', () => {
        const {confDir, modulesDir} = fixture({
            modules: {}, enabled: {}, allowlist: ['GuildMembers'],
            customCommands: [{type: 'MESSAGE', enabled: true, matchType: 'contains', matchString: 'hi'}]
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.names).not.toContain('MessageContent');
        expect(r.droppedPrivileged).toContain('MessageContent');
        expect(r.names).toContain('GuildMessages'); // pairing still injected, non-privileged
    });

    test('config.json present but allowedPrivilegedIntents field absent = all allowed (upgrade path)', () => {
        const {confDir, modulesDir} = fixture({
            modules: {sr: {intents: ['GuildPresences']}}, enabled: {sr: true}
            // no allowlist arg => config.json is written as {} (field absent)
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.allowedPrivileged).toEqual([]);
        expect(r.names).toContain('GuildPresences');
        expect(r.disabledModules).toEqual([]);
    });

    test('non-array allowedPrivilegedIntents is treated as empty (all allowed)', () => {
        const {confDir, modulesDir} = fixture({
            modules: {sr: {intents: ['GuildPresences']}}, enabled: {sr: true}, allowlist: 'GuildPresences'
        });
        const r = computeRequiredIntents(confDir, modulesDir);
        expect(r.allowedPrivileged).toEqual([]);
        expect(r.names).toContain('GuildPresences');
    });
});

describe('privilegedIntentUsage allowlist annotations', () => {
    test('marks intents dropped by the allowlist as not granted', () => {
        const {confDir, modulesDir} = fixture({
            modules: {sr: {intents: ['GuildPresences'], intentReasons: {GuildPresences: 'status roles'}}},
            enabled: {sr: true},
            allowlist: ['GuildMembers']
        });
        const usage = privilegedIntentUsage(confDir, modulesDir);
        const entry = usage.GuildPresences.find(e => e.module === 'sr');
        expect(entry.granted).toBe(false);
        expect(entry.optional).toBe(false);
    });

    test('marks a module\'s optional intent as optional, and granted follows the allowlist', () => {
        const {confDir, modulesDir} = fixture({
            modules: {a: {intents: ['GuildPresences'], optionalIntents: ['GuildPresences']}},
            enabled: {a: true},
            allowlist: ['GuildMembers']
        });
        const usage = privilegedIntentUsage(confDir, modulesDir);
        const entry = usage.GuildPresences.find(e => e.module === 'a');
        expect(entry.granted).toBe(false);
        expect(entry.optional).toBe(true);
    });

    test('empty allowlist grants everything', () => {
        const {confDir, modulesDir} = fixture({
            modules: {a: {intents: ['GuildPresences'], optionalIntents: ['GuildPresences']}},
            enabled: {a: true},
            allowlist: []
        });
        const usage = privilegedIntentUsage(confDir, modulesDir);
        const entry = usage.GuildPresences.find(e => e.module === 'a');
        expect(entry.granted).toBe(true);
        expect(entry.optional).toBe(true);
    });

    test('custom-commands MessageContent entry is annotated with granted', () => {
        const {confDir, modulesDir} = fixture({
            modules: {}, enabled: {}, allowlist: ['GuildMembers'],
            customCommands: [{type: 'MESSAGE', enabled: true, matchType: 'contains', matchString: 'hi'}]
        });
        const usage = privilegedIntentUsage(confDir, modulesDir);
        const entry = usage.MessageContent.find(e => e.module === 'custom-commands');
        expect(entry.granted).toBe(false);
        expect(entry.optional).toBe(false);
    });
});
