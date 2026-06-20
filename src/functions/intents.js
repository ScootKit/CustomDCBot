const {GatewayIntentBits} = require('discord.js');
const path = require('path');
const jsonfile = require('jsonfile');

// Always requested; core (non-module) events only need Guilds.
const BASE_INTENTS = ['Guilds'];

// GatewayIntentBits is a numeric enum with reverse-mapping string keys; accept only the real names.
const VALID_INTENT_NAMES = new Set(
    Object.keys(GatewayIntentBits).filter(k => typeof GatewayIntentBits[k] === 'number')
);

function resolveIntents(names) {
    const merged = [...new Set([...BASE_INTENTS, ...names])];
    const valid = [];
    const unknown = [];
    for (const name of merged) {
        if (VALID_INTENT_NAMES.has(name)) valid.push(name);
        else unknown.push(name);
    }
    valid.sort();
    return {
        names: valid,
        flags: valid.map(n => GatewayIntentBits[n]),
        unknown
    };
}

// Names required but not currently active (never reports intents to remove).
function diffIntents(activeNames, requiredNames) {
    const active = new Set(activeNames);
    return requiredNames.filter(n => !active.has(n));
}

// MessageContent is useless without a message intent; inject GuildMessages if neither is present.
function applyPairingRule(names) {
    const set = new Set(names);
    if (set.has('MessageContent') && !set.has('GuildMessages') && !set.has('DirectMessages')) {
        return {
            names: [...names, 'GuildMessages'],
            injected: true
        };
    }
    return {
        names,
        injected: false
    };
}

const CUSTOM_COMMAND_TRIGGER_INTENTS = {
    MESSAGE: ['GuildMessages', 'MessageContent']
};

const CUSTOM_COMMAND_ACTION_INTENTS = {};

function customCommandIntents(confDir) {
    let customCommands;
    try {
        customCommands = jsonfile.readFileSync(path.join(confDir, 'custom-commands.json'));
    } catch {
        return [];
    }
    if (!Array.isArray(customCommands)) return [];
    const needed = [];
    for (const command of customCommands) {
        if (!command || !command.enabled) continue;
        if (CUSTOM_COMMAND_TRIGGER_INTENTS[command.type]) needed.push(...CUSTOM_COMMAND_TRIGGER_INTENTS[command.type]);
        for (const block of (command.actions || [])) {
            for (const action of ((block && block.actions) || [])) {
                if (action && CUSTOM_COMMAND_ACTION_INTENTS[action.type]) needed.push(...CUSTOM_COMMAND_ACTION_INTENTS[action.type]);
            }
        }
    }
    return [...new Set(needed)];
}

// Union the enabled modules' declared intents with the base set, apply the pairing rule, then resolve.
function computeRequiredIntents(confDir, modulesDir) {
    let moduleConf = {};
    try {
        moduleConf = jsonfile.readFileSync(path.join(confDir, 'modules.json'));
    } catch {
        moduleConf = {};
    }
    const declared = [];
    for (const name of Object.keys(moduleConf)) {
        if (!moduleConf[name]) continue;
        let moduleJson;
        try {
            moduleJson = jsonfile.readFileSync(path.join(modulesDir, name, 'module.json'));
        } catch {
            continue;
        }
        if (Array.isArray(moduleJson.intents)) declared.push(...moduleJson.intents);
    }
    declared.push(...customCommandIntents(confDir));
    const {
        names: paired,
        injected
    } = applyPairingRule([...new Set(declared)]);
    const resolved = resolveIntents(paired);
    return {
        ...resolved,
        pairingInjected: injected
    };
}

const PRIVILEGED_INTENTS = ['GuildMembers', 'GuildPresences', 'MessageContent'];

// Per privileged intent, the enabled modules requiring it with each module's declared reason.
function privilegedIntentUsage(confDir, modulesDir = path.join(__dirname, '..', '..', 'modules')) {
    const out = {};

    function add(intent, entry) {
        if (!out[intent]) out[intent] = [];
        out[intent].push(entry);
    }

    let moduleConf = {};
    try {
        moduleConf = jsonfile.readFileSync(path.join(confDir, 'modules.json'));
    } catch {
        moduleConf = {};
    }
    for (const name of Object.keys(moduleConf)) {
        if (!moduleConf[name]) continue;
        let moduleJson;
        try {
            moduleJson = jsonfile.readFileSync(path.join(modulesDir, name, 'module.json'));
        } catch {
            continue;
        }
        const intents = Array.isArray(moduleJson.intents) ? moduleJson.intents : [];
        const reasons = (moduleJson.intentReasons && typeof moduleJson.intentReasons === 'object') ? moduleJson.intentReasons : {};
        for (const intent of PRIVILEGED_INTENTS) {
            if (!intents.includes(intent)) continue;
            add(intent, {
                module: name,
                name: moduleJson.humanReadableName || name,
                reason: reasons[intent] || null
            });
        }
    }
    if (customCommandIntents(confDir).includes('MessageContent')) {
        add('MessageContent', {
            module: 'custom-commands',
            name: 'Custom commands',
            reason: 'Message-trigger auto-responders read message text to decide when to reply.'
        });
    }
    return out;
}

module.exports = {
    BASE_INTENTS,
    PRIVILEGED_INTENTS,
    CUSTOM_COMMAND_TRIGGER_INTENTS,
    CUSTOM_COMMAND_ACTION_INTENTS,
    resolveIntents,
    diffIntents,
    applyPairingRule,
    customCommandIntents,
    computeRequiredIntents,
    privilegedIntentUsage
};
