const fs = require('fs');
const os = require('os');
const path = require('path');
const {privilegedIntentUsage} = require('../../src/functions/intents');

function tmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'intents-'));
}

function writeModule(modulesDir, name, moduleJson) {
    fs.mkdirSync(path.join(modulesDir, name), {recursive: true});
    fs.writeFileSync(path.join(modulesDir, name, 'module.json'), JSON.stringify(moduleJson));
}

describe('privilegedIntentUsage', () => {
    test('returns an empty object when modules.json is missing', () => {
        const confDir = tmp();
        expect(privilegedIntentUsage(confDir, tmp())).toEqual({});
    });

    test('skips an enabled module whose module.json is missing', () => {
        const confDir = tmp();
        const modulesDir = tmp();
        fs.writeFileSync(path.join(confDir, 'modules.json'), JSON.stringify({ghost: true}));
        expect(privilegedIntentUsage(confDir, modulesDir)).toEqual({});
    });

    test('groups enabled modules by privileged intent with their declared reason', () => {
        const confDir = tmp();
        const modulesDir = tmp();
        fs.writeFileSync(path.join(confDir, 'modules.json'), JSON.stringify({a: true, b: false}));
        writeModule(modulesDir, 'a', {
            humanReadableName: 'Module A',
            intents: ['GuildMembers', 'GuildMessages'],
            intentReasons: {GuildMembers: 'needs members'}
        });
        writeModule(modulesDir, 'b', {intents: ['GuildPresences']});
        const out = privilegedIntentUsage(confDir, modulesDir);
        expect(out.GuildMembers).toEqual([{module: 'a', name: 'Module A', reason: 'needs members'}]);
        expect(out.GuildPresences).toBeUndefined();
    });

    test('ignores an enabled module that declares no intents array', () => {
        const confDir = tmp();
        const modulesDir = tmp();
        fs.writeFileSync(path.join(confDir, 'modules.json'), JSON.stringify({a: true}));
        writeModule(modulesDir, 'a', {humanReadableName: 'No Intents'});
        expect(privilegedIntentUsage(confDir, modulesDir)).toEqual({});
    });

    test('falls back to module name when no reason is declared', () => {
        const confDir = tmp();
        const modulesDir = tmp();
        fs.writeFileSync(path.join(confDir, 'modules.json'), JSON.stringify({a: true}));
        writeModule(modulesDir, 'a', {intents: ['MessageContent', 'GuildMessages']});
        const out = privilegedIntentUsage(confDir, modulesDir);
        expect(out.MessageContent).toEqual([{module: 'a', name: 'a', reason: null}]);
    });

    test('attributes a custom-command message trigger to a synthetic entry', () => {
        const confDir = tmp();
        const modulesDir = tmp();
        fs.writeFileSync(path.join(confDir, 'modules.json'), JSON.stringify({}));
        fs.writeFileSync(path.join(confDir, 'custom-commands.json'), JSON.stringify([
            {enabled: true, type: 'MESSAGE', actions: []}
        ]));
        const out = privilegedIntentUsage(confDir, modulesDir);
        expect(out.MessageContent).toEqual([{
            module: 'custom-commands',
            name: 'Custom commands',
            reason: 'Message-trigger auto-responders read message text to decide when to reply.'
        }]);
    });

    test('defaults modulesDir when omitted', () => {
        const confDir = tmp();
        fs.writeFileSync(path.join(confDir, 'modules.json'), JSON.stringify({}));
        expect(privilegedIntentUsage(confDir)).toEqual({});
    });
});
