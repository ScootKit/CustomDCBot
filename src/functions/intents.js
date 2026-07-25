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

const PRIVILEGED_INTENTS = ['GuildMembers', 'GuildPresences', 'MessageContent'];

// Operator-declared allowlist from config.json. Missing/non-array => [] (= all allowed).
function readAllowedPrivilegedIntents(confDir) {
    let config;
    try {
        config = jsonfile.readFileSync(path.join(confDir, 'config.json'));
    } catch {
        return [];
    }
    return Array.isArray(config.allowedPrivilegedIntents) ? config.allowedPrivilegedIntents : [];
}

// Splits a raw allowlist into valid privileged names (deduped, order-preserved) and invalid entries.
function partitionAllowlist(list) {
    const allowed = [];
    const bad = [];
    for (const name of (Array.isArray(list) ? list : [])) {
        if (PRIVILEGED_INTENTS.includes(name)) {
            if (!allowed.includes(name)) allowed.push(name);
        } else bad.push(name);
    }
    return {
        allowed,
        bad
    };
}

/**
 * Unions the enabled modules' declared intents with the base set, applies the pairing rule, then
 * validates/resolves. Privileged intents are gated by the operator allowlist in config.json: a
 * module whose REQUIRED privileged intent is not allowed is disabled entirely, one for which it is
 * only OPTIONAL is degraded (stays active, the intent is dropped).
 * @param {String} confDir Directory containing modules.json and custom-commands.json
 * @param {String} modulesDir Directory containing module subfolders
 * @returns {{names: String[], flags: Number[], unknown: String[], pairingInjected: Boolean,
 *   allowedPrivileged: String[], disabledModules: Object[], degradedModules: Object[],
 *   droppedPrivileged: String[], badAllowlistEntries: String[]}}
 */
function computeRequiredIntents(confDir, modulesDir) {
    const {
        allowed: allowedPrivileged,
        bad: badAllowlistEntries
    } = partitionAllowlist(readAllowedPrivilegedIntents(confDir));
    const allowAll = allowedPrivileged.length === 0; // empty OR all-invalid => everything allowed
    const isAllowed = (intent) => !PRIVILEGED_INTENTS.includes(intent) || allowAll || allowedPrivileged.includes(intent);

    let moduleConf = {};
    try {
        moduleConf = jsonfile.readFileSync(path.join(confDir, 'modules.json'));
    } catch {
        moduleConf = {};
    }
    const disabledModules = [];
    const degradedModules = [];
    const declared = []; // only from ACTIVE modules
    for (const name of Object.keys(moduleConf)) {
        if (!moduleConf[name]) continue;
        let moduleJson;
        try {
            moduleJson = jsonfile.readFileSync(path.join(modulesDir, name, 'module.json'));
        } catch {
            continue;
        }
        const intents = Array.isArray(moduleJson.intents) ? moduleJson.intents : [];
        const optional = Array.isArray(moduleJson.optionalIntents) ? moduleJson.optionalIntents : [];
        const privileged = intents.filter(i => PRIVILEGED_INTENTS.includes(i));
        const missingRequired = privileged.filter(i => !optional.includes(i) && !isAllowed(i));
        if (missingRequired.length) {
            disabledModules.push({
                module: name,
                missingRequired
            });
            continue;
        }
        const missingOptional = privileged.filter(i => optional.includes(i) && !isAllowed(i));
        if (missingOptional.length) degradedModules.push({
            module: name,
            missingOptional
        });
        declared.push(...intents);
    }
    declared.push(...customCommandIntents(confDir));
    const {
        names: paired,
        injected
    } = applyPairingRule([...new Set(declared)]);
    const droppedPrivileged = [...new Set(paired.filter(i => PRIVILEGED_INTENTS.includes(i) && !isAllowed(i)))];
    const resolved = resolveIntents(paired.filter(isAllowed));
    return {
        ...resolved,
        pairingInjected: injected,
        allowedPrivileged,
        disabledModules,
        degradedModules,
        droppedPrivileged,
        badAllowlistEntries
    };
}

// Per privileged intent, the enabled modules requiring it with each module's declared reason.
function privilegedIntentUsage(confDir, modulesDir = path.join(__dirname, '..', '..', 'modules')) {
    const out = {};

    function add(intent, entry) {
        if (!out[intent]) out[intent] = [];
        out[intent].push(entry);
    }

    const {allowed: allowedPrivileged} = partitionAllowlist(readAllowedPrivilegedIntents(confDir));
    const allowAll = allowedPrivileged.length === 0;
    const granted = (intent) => allowAll || allowedPrivileged.includes(intent);

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
        const optional = Array.isArray(moduleJson.optionalIntents) ? moduleJson.optionalIntents : [];
        for (const intent of PRIVILEGED_INTENTS) {
            if (!intents.includes(intent)) continue;
            add(intent, {
                module: name,
                name: moduleJson.humanReadableName || name,
                reason: reasons[intent] || null,
                granted: granted(intent),
                optional: optional.includes(intent)
            });
        }
    }
    if (customCommandIntents(confDir).includes('MessageContent')) {
        add('MessageContent', {
            module: 'custom-commands',
            name: 'Custom commands',
            reason: 'Message-trigger auto-responders read message text to decide when to reply.',
            granted: granted('MessageContent'),
            optional: false
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
    privilegedIntentUsage,
    readAllowedPrivilegedIntents,
    partitionAllowlist
};
