const fs = require('fs');
const os = require('os');
const path = require('path');
const {applyIntentDisables} = require('../../src/functions/configuration');

function fixture(enabled, moduleIntents, allowlist) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'disable-'));
    fs.mkdirSync(path.join(root, 'config'));
    fs.mkdirSync(path.join(root, 'modules'));
    for (const [m, json] of Object.entries(moduleIntents)) {
        fs.mkdirSync(path.join(root, 'modules', m));
        fs.writeFileSync(path.join(root, 'modules', m, 'module.json'), JSON.stringify(json));
    }
    fs.writeFileSync(path.join(root, 'config', 'modules.json'), JSON.stringify(enabled));
    fs.writeFileSync(path.join(root, 'config', 'config.json'), JSON.stringify({allowedPrivilegedIntents: allowlist}));
    const modules = {};
    for (const m of Object.keys(moduleIntents)) modules[m] = {enabled: !!enabled[m], userEnabled: !!enabled[m]};
    const client = {
        configDir: path.join(root, 'config'), modules, scnxSetup: false,
        logger: {warn: () => {}, info: () => {}, error: () => {}}
    };
    return {client, modulesDir: path.join(root, 'modules')};
}

test('disables a module missing a required privileged intent, leaving userEnabled true', async () => {
    const {client, modulesDir} = fixture(
        {sr: true}, {sr: {intents: ['GuildPresences']}}, ['GuildMembers']);
    const disabled = await applyIntentDisables(client, modulesDir);
    expect([...disabled]).toEqual(['sr']);
    expect(client.modules.sr.enabled).toBe(false);
    expect(client.modules.sr.userEnabled).toBe(true);
});

test('re-applying after a reset (reload) keeps the module disabled (C1 regression)', async () => {
    const {client, modulesDir} = fixture(
        {sr: true}, {sr: {intents: ['GuildPresences']}}, ['GuildMembers']);
    await applyIntentDisables(client, modulesDir);
    client.modules.sr.enabled = true; // simulate reloadConfig reset (configuration.js:459-462)
    client.modules.sr.userEnabled = true;
    await applyIntentDisables(client, modulesDir);
    expect(client.modules.sr.enabled).toBe(false);
});

test('tolerates a disabled-list module with no client.modules entry (hidden module)', async () => {
    const {client, modulesDir} = fixture(
        {sr: true}, {sr: {intents: ['GuildPresences']}}, ['GuildMembers']);
    delete client.modules.sr;
    const disabled = await applyIntentDisables(client, modulesDir);
    expect([...disabled]).toEqual(['sr']); // reported, but no throw
});

test('empty allowlist disables nothing', async () => {
    const {client, modulesDir} = fixture(
        {sr: true}, {sr: {intents: ['GuildPresences']}}, []);
    const disabled = await applyIntentDisables(client, modulesDir);
    expect([...disabled]).toEqual([]);
    expect(client.modules.sr.enabled).toBe(true);
});
