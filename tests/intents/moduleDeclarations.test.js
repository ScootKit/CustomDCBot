const fs = require('fs');
const path = require('path');
const {GatewayIntentBits} = require('discord.js');
const {BASE_INTENTS} = require('../../src/functions/intents');

const MODULES_DIR = path.join(__dirname, '..', '..', 'modules');

/*
 * The intent set the bot requested before dynamic intent loading (the old hardcoded list in main.js),
 * de-duplicated. The all-modules union must never exceed this set, so the move to per-module
 * declarations can only ever request fewer intents, never escalate privileges.
 */
const LEGACY_HARDCODED_INTENTS = [
    'Guilds', 'DirectMessages', 'GuildMessages', 'MessageContent', 'GuildVoiceStates',
    'GuildPresences', 'GuildInvites', 'GuildEmojisAndStickers', 'GuildMessageReactions',
    'GuildMembers', 'GuildWebhooks', 'AutoModerationExecution', 'GuildModeration'
];

/*
 * moderation is intentionally held back from the intent-declaration sync, so it carries no `intents`
 * key yet. Its event needs are covered by the union of the other modules' declarations.
 */
const EXEMPT_MODULES = new Set(['moderation']);

function moduleNames() {
    return fs.readdirSync(MODULES_DIR).filter(n => fs.existsSync(path.join(MODULES_DIR, n, 'module.json')));
}

function readAllModuleIntents() {
    const map = {};
    for (const n of moduleNames()) {
        const json = require(path.join(MODULES_DIR, n, 'module.json'));
        map[n] = Array.isArray(json.intents) ? json.intents : [];
    }
    return map;
}

describe('module intent declarations', () => {
    const declarations = readAllModuleIntents();

    test('every non-exempt module.json declares an intents array', () => {
        const namesWithoutKey = moduleNames()
            .filter(n => !EXEMPT_MODULES.has(n))
            .filter(n => !Array.isArray(require(path.join(MODULES_DIR, n, 'module.json')).intents));
        expect(namesWithoutKey).toEqual([]);
    });

    test('all declared intent names are valid GatewayIntentBits keys', () => {
        const bad = [];
        for (const [mod, intents] of Object.entries(declarations)) {
            for (const i of intents) {
                if (!Object.prototype.hasOwnProperty.call(GatewayIntentBits, i)) bad.push(`${mod}:${i}`);
            }
        }
        expect(bad).toEqual([]);
    });

    test('any module with MessageContent also has GuildMessages or DirectMessages', () => {
        const offenders = Object.entries(declarations)
            .filter(([, v]) => v.includes('MessageContent') &&
                !v.includes('GuildMessages') && !v.includes('DirectMessages'))
            .map(([m]) => m);
        expect(offenders).toEqual([]);
    });

    test('union of all modules + base never escalates beyond the legacy hardcoded set', () => {
        const union = new Set(BASE_INTENTS);
        for (const intents of Object.values(declarations)) intents.forEach(i => union.add(i));
        const escalations = [...union].filter(i => !LEGACY_HARDCODED_INTENTS.includes(i));
        expect(escalations).toEqual([]);
    });
});
