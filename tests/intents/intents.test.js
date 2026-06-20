const {GatewayIntentBits} = require('discord.js');
const {
    BASE_INTENTS,
    resolveIntents,
    diffIntents
} = require('../../src/functions/intents');

describe('BASE_INTENTS', () => {
    test('is exactly [Guilds]', () => {
        expect(BASE_INTENTS).toEqual(['Guilds']);
    });
});

describe('resolveIntents', () => {
    test('dedupes and always includes base Guilds', () => {
        const {names} = resolveIntents(['GuildMembers', 'GuildMembers']);
        expect(names.filter(n => n === 'GuildMembers')).toHaveLength(1);
        expect(names).toContain('Guilds');
    });

    test('returns sorted names', () => {
        const {names} = resolveIntents(['GuildVoiceStates', 'GuildMembers']);
        expect(names).toEqual([...names].sort());
    });

    test('resolves flags to GatewayIntentBits values', () => {
        const {flags} = resolveIntents(['GuildMembers']);
        expect(flags).toContain(GatewayIntentBits.Guilds);
        expect(flags).toContain(GatewayIntentBits.GuildMembers);
    });

    test('collects unknown names and excludes them from flags/names', () => {
        const {
            names,
            flags,
            unknown
        } = resolveIntents(['GuildMembers', 'NotARealIntent']);
        expect(unknown).toEqual(['NotARealIntent']);
        expect(names).not.toContain('NotARealIntent');
        expect(flags).toHaveLength(2); // Guilds + GuildMembers
    });

    test('empty input yields just the base', () => {
        const {names} = resolveIntents([]);
        expect(names).toEqual(['Guilds']);
    });
});

describe('diffIntents', () => {
    test('returns required names missing from active', () => {
        expect(diffIntents(['Guilds'], ['Guilds', 'GuildMembers'])).toEqual(['GuildMembers']);
    });

    test('returns empty when required is a subset of active', () => {
        expect(diffIntents(['Guilds', 'GuildMembers'], ['Guilds'])).toEqual([]);
    });

    test('returns empty when sets are equal', () => {
        expect(diffIntents(['Guilds', 'GuildMembers'], ['GuildMembers', 'Guilds'])).toEqual([]);
    });
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    computeRequiredIntents,
    applyPairingRule,
    customCommandIntents,
    CUSTOM_COMMAND_ACTION_INTENTS,
    privilegedIntentUsage
} = require('../../src/functions/intents');

function makeFixture(modulesMap, enabledMap, customCommands) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intents-'));
    const confDir = path.join(root, 'config');
    const modulesDir = path.join(root, 'modules');
    fs.mkdirSync(confDir);
    fs.mkdirSync(modulesDir);
    for (const [name, moduleJson] of Object.entries(modulesMap)) {
        fs.mkdirSync(path.join(modulesDir, name));
        fs.writeFileSync(path.join(modulesDir, name, 'module.json'), JSON.stringify(moduleJson));
    }
    fs.writeFileSync(path.join(confDir, 'modules.json'), JSON.stringify(enabledMap));
    if (typeof customCommands !== 'undefined') {
        fs.writeFileSync(path.join(confDir, 'custom-commands.json'), JSON.stringify(customCommands));
    }
    return {
        confDir,
        modulesDir
    };
}

describe('applyPairingRule', () => {
    test('injects GuildMessages when MessageContent lacks a message intent', () => {
        const {
            names,
            injected
        } = applyPairingRule(['MessageContent']);
        expect(names).toContain('GuildMessages');
        expect(injected).toBe(true);
    });

    test('leaves set untouched when GuildMessages already present', () => {
        const {
            names,
            injected
        } = applyPairingRule(['MessageContent', 'GuildMessages']);
        expect(injected).toBe(false);
        expect(names).toEqual(['MessageContent', 'GuildMessages']);
    });

    test('DirectMessages satisfies the pairing without injecting GuildMessages', () => {
        const {
            names,
            injected
        } = applyPairingRule(['MessageContent', 'DirectMessages']);
        expect(injected).toBe(false);
        expect(names).not.toContain('GuildMessages');
    });

    test('no MessageContent means no change', () => {
        const {
            names,
            injected
        } = applyPairingRule(['GuildMembers']);
        expect(injected).toBe(false);
        expect(names).toEqual(['GuildMembers']);
    });
});

describe('computeRequiredIntents', () => {
    test('unions intents of enabled modules with base, ignores disabled', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({
            alpha: {intents: ['GuildMembers']},
            beta: {intents: ['GuildVoiceStates']},
            gamma: {intents: ['GuildPresences']}
        }, {
            alpha: true,
            beta: true,
            gamma: false
        });
        const {names} = computeRequiredIntents(confDir, modulesDir);
        expect(names).toEqual(['GuildMembers', 'GuildVoiceStates', 'Guilds'].sort());
    });

    test('module without intents key contributes nothing', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({alpha: {}}, {alpha: true});
        const {names} = computeRequiredIntents(confDir, modulesDir);
        expect(names).toEqual(['Guilds']);
    });

    test('missing modules.json yields base only', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({alpha: {intents: ['GuildMembers']}}, {});
        fs.rmSync(path.join(confDir, 'modules.json'));
        const {names} = computeRequiredIntents(confDir, modulesDir);
        expect(names).toEqual(['Guilds']);
    });

    test('unknown declared intent surfaces in unknown', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({alpha: {intents: ['Bogus']}}, {alpha: true});
        const {unknown} = computeRequiredIntents(confDir, modulesDir);
        expect(unknown).toContain('Bogus');
    });

    test('applies MessageContent pairing rule across the union', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({alpha: {intents: ['MessageContent']}}, {alpha: true});
        const {names} = computeRequiredIntents(confDir, modulesDir);
        expect(names).toContain('GuildMessages');
    });

    test('enabled module with no folder/module.json is skipped', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({alpha: {intents: ['GuildMembers']}}, {
            alpha: true,
            ghost: true
        });
        const {names} = computeRequiredIntents(confDir, modulesDir);
        expect(names).toEqual(['GuildMembers', 'Guilds'].sort());
    });

    test('requests NO privileged intent when no enabled module needs one (startup without privileged intents)', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({
            a: {intents: ['GuildMessageReactions']},
            b: {intents: ['GuildVoiceStates', 'GuildMessages']},
            c: {intents: []}
        }, {
            a: true,
            b: true,
            c: true
        });
        const {names} = computeRequiredIntents(confDir, modulesDir);
        for (const priv of ['GuildMembers', 'GuildPresences', 'MessageContent']) expect(names).not.toContain(priv);
    });

    test('folds in custom-command intents (enabled MESSAGE autoresponder)', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture(
            {}, {}, [{
                type: 'MESSAGE',
                enabled: true,
                matchType: 'contains',
                matchString: 'hi'
            }]
        );
        const {names} = computeRequiredIntents(confDir, modulesDir);
        expect(names).toEqual(['GuildMessages', 'Guilds', 'MessageContent'].sort());
    });

    test('custom commands without an autoresponder add nothing', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture(
            {}, {}, [{
                type: 'COMMAND',
                enabled: true,
                slashCommandName: 'ping'
            }]
        );
        const {names} = computeRequiredIntents(confDir, modulesDir);
        expect(names).toEqual(['Guilds']);
    });
});

describe('resolveIntents — numeric-enum hardening', () => {
    test('digit-string keys (GatewayIntentBits reverse-mappings) are rejected as unknown', () => {
        const {
            names,
            flags,
            unknown
        } = resolveIntents(['1', '2048', 'GuildMembers']);
        expect(unknown).toEqual(expect.arrayContaining(['1', '2048']));
        expect(names).not.toContain('1');
        expect(names).not.toContain('2048');
        expect(flags.every(f => typeof f === 'number')).toBe(true);
        expect(names).toContain('GuildMembers');
    });
});

describe('customCommandIntents', () => {
    function ccFixture(customCommands) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
        const confDir = path.join(root, 'config');
        fs.mkdirSync(confDir);
        if (typeof customCommands !== 'undefined') {
            fs.writeFileSync(path.join(confDir, 'custom-commands.json'), JSON.stringify(customCommands));
        }
        return confDir;
    }

    test('missing custom-commands.json -> []', () => {
        expect(customCommandIntents(ccFixture())).toEqual([]);
    });

    test('non-array content -> []', () => {
        expect(customCommandIntents(ccFixture({not: 'an array'}))).toEqual([]);
    });

    test('enabled MESSAGE autoresponder -> GuildMessages + MessageContent', () => {
        const confDir = ccFixture([{
            type: 'MESSAGE',
            enabled: true,
            matchType: 'everyMessage'
        }]);
        expect(customCommandIntents(confDir).sort()).toEqual(['GuildMessages', 'MessageContent']);
    });

    test('disabled MESSAGE autoresponder -> []', () => {
        expect(customCommandIntents(ccFixture([{
            type: 'MESSAGE',
            enabled: false,
            matchString: 'x'
        }]))).toEqual([]);
    });

    test('only slash/button/modal commands -> []', () => {
        const confDir = ccFixture([
            {
                type: 'COMMAND',
                enabled: true,
                slashCommandName: 'ping'
            },
            {
                type: 'BUTTON',
                enabled: true
            },
            {
                type: 'MODAL',
                enabled: true
            }
        ]);
        expect(customCommandIntents(confDir)).toEqual([]);
    });

    test('enabled command with action blocks but no special trigger/action -> []', () => {
        const confDir = ccFixture([{
            type: 'COMMAND',
            enabled: true,
            slashCommandName: 'role',
            actions: [{
                actions: [{
                    type: 'MANAGE_ROLES',
                    addRoles: ['1']
                }, {
                    type: 'REPLY',
                    message: 'done'
                }]
            }]
        }]);
        expect(customCommandIntents(confDir)).toEqual([]);
    });

    test('malformed action blocks do not crash', () => {
        const confDir = ccFixture([
            {
                type: 'COMMAND',
                enabled: true,
                actions: [{}, {actions: [null]}, null]
            }
        ]);
        expect(customCommandIntents(confDir)).toEqual([]);
    });

    test('extension point: an action type mapped to an intent is picked up', () => {
        // Simulate a future action that consumes gateway state.
        CUSTOM_COMMAND_ACTION_INTENTS.FUTURE_VOICE_ACTION = ['GuildVoiceStates'];
        try {
            const confDir = ccFixture([{
                type: 'COMMAND',
                enabled: true,
                actions: [{actions: [{type: 'FUTURE_VOICE_ACTION'}]}]
            }]);
            expect(customCommandIntents(confDir)).toEqual(['GuildVoiceStates']);
        } finally {
            delete CUSTOM_COMMAND_ACTION_INTENTS.FUTURE_VOICE_ACTION;
        }
    });

    test('null/garbage entries are ignored', () => {
        const confDir = ccFixture([null, {enabled: true}, {
            type: 'MESSAGE',
            enabled: true,
            matchString: 'hey'
        }]);
        expect(customCommandIntents(confDir).sort()).toEqual(['GuildMessages', 'MessageContent']);
    });
});

describe('privilegedIntentUsage', () => {
    test('maps each privileged intent to enabled modules + reasons (fallback to name), ignoring disabled and non-privileged', () => {
        const {
            confDir,
            modulesDir
        } = makeFixture({
            moderation: {
                intents: ['GuildMembers', 'MessageContent'],
                humanReadableName: 'Moderation',
                intentReasons: {
                    GuildMembers: 'Anti-raid and captcha',
                    MessageContent: 'Spam/phishing filtering'
                }
            },
            welcomer: {
                intents: ['GuildMembers'],
                humanReadableName: 'Welcomer'
            },
            polls: {
                intents: ['GuildMessageReactions'],
                humanReadableName: 'Polls'
            },
            statusRoles: {
                intents: ['GuildPresences'],
                humanReadableName: 'Status Roles'
            }
        }, {
            moderation: true,
            welcomer: true,
            polls: true,
            statusRoles: false
        });
        const usage = privilegedIntentUsage(confDir, modulesDir);
        expect(usage.GuildMembers).toEqual(expect.arrayContaining([
            {
                module: 'moderation',
                name: 'Moderation',
                reason: 'Anti-raid and captcha'
            },
            {
                module: 'welcomer',
                name: 'Welcomer',
                reason: null
            }  // no intentReasons -> reason null, name fallback
        ]));
        expect(usage.MessageContent).toEqual([{
            module: 'moderation',
            name: 'Moderation',
            reason: 'Spam/phishing filtering'
        }]);
        expect(usage.GuildPresences).toBeUndefined();           // statusRoles disabled
        expect(usage.GuildMessageReactions).toBeUndefined();    // non-privileged intents excluded
    });
});