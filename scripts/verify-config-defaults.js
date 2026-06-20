#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const VALID_TYPES = new Set([
    'string', 'emoji', 'imgURL', 'timezone',
    'boolean', 'integer', 'float',
    'channelID', 'roleID', 'userID', 'guildID',
    'array', 'keyed', 'select'
]);

let errors = 0;
let warnings = 0;
let filesChecked = 0;
let fieldsChecked = 0;

function report(level, filePath, fieldName, message) {
    const prefix = level === 'error' ? '\x1b[31mERROR\x1b[0m' : '\x1b[33mWARN\x1b[0m';
    const loc = fieldName ? `${filePath} -> ${fieldName}` : filePath;
    console.log(`  ${prefix}: ${loc}: ${message}`);
    if (level === 'error') errors++;
    else warnings++;
}

function isLocalizedObject(value) {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    if (!('en' in value)) return false;
    return Object.keys(value).every(k => /^[a-z]{2,3}$/.test(k));
}

function resolveDefault(field) {
    if (isLocalizedObject(field.default)) return field.default['en'];
    return field.default;
}

function isValidV2Embed(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    const validKeys = new Set([
        'message', 'title', 'description', 'color', 'url',
        'image', 'thumbnail', 'author', 'fields', 'footer',
        'footerImgUrl', 'embedTimestamp', '_schema'
    ]);
    const hasEmbedKey = obj.title || obj.description || (obj.author && obj.author.name) || obj.image || obj.message;
    if (!hasEmbedKey) return false;

    for (const key of Object.keys(obj)) {
        if (!validKeys.has(key)) return false;
    }

    if (obj.author) {
        if (typeof obj.author !== 'object' || Array.isArray(obj.author)) return false;
        const authorKeys = new Set(['name', 'img', 'url']);
        for (const key of Object.keys(obj.author)) {
            if (!authorKeys.has(key)) return false;
        }
    }
    if (obj.fields) {
        if (!Array.isArray(obj.fields)) return false;
        for (const f of obj.fields) {
            if (typeof f.name !== 'string' || typeof f.value !== 'string') return false;
        }
    }
    return true;
}

function isValidV3Message(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    return obj._schema === 'v3';
}

function isValidV4Message(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    return obj._schema === 'v4';
}

function looksLikeV3ButMissingSchema(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    if (obj._schema) return false;
    // Has v3-specific keys like embeds, content (as top-level message content), buttons, linkButtons, attachmentURLs
    return !!(obj.embeds || obj.buttons || obj.linkButtons || obj.attachmentURLs ||
        (obj.content && !obj.title && !obj.description));
}

function verifyField(filePath, field) {
    fieldsChecked++;
    const name = field.name;

    if (!name) {
        report('error', filePath, '(unnamed)', 'Field is missing "name" property');
        return;
    }

    if (typeof field.default === 'undefined') {
        report('error', filePath, name, 'Missing "default" value');
        return;
    }

    if (!field.type) {
        report('error', filePath, name, 'Missing "type" property');
        return;
    }

    if (!VALID_TYPES.has(field.type)) {
        report('error', filePath, name, `Unknown type "${field.type}"`);
        return;
    }

    const def = resolveDefault(field);

    // allowNull fields with null default are valid
    if (field.allowNull && (def === null || def === '')) return;

    switch (field.type) {
        case 'boolean':
            if (typeof def !== 'boolean') {
                report('error', filePath, name, `Type is "boolean" but default is ${JSON.stringify(def)} (${typeof def})`);
            }
            break;

        case 'integer':
            if (def !== '' && def !== null && def !== 0) {
                if (typeof def !== 'number' || !Number.isInteger(def)) {
                    report('error', filePath, name, `Type is "integer" but default is ${JSON.stringify(def)} (${typeof def})`);
                }
            }
            if (typeof def === 'number') {
                if (field.maxValue !== undefined && def > field.maxValue) {
                    report('error', filePath, name, `Default ${def} exceeds maxValue ${field.maxValue}`);
                }
                if (field.minValue !== undefined && def < field.minValue) {
                    report('error', filePath, name, `Default ${def} is below minValue ${field.minValue}`);
                }
            }
            break;

        case 'float':
            if (def !== '' && def !== null && def !== 0) {
                if (typeof def !== 'number') {
                    report('error', filePath, name, `Type is "float" but default is ${JSON.stringify(def)} (${typeof def})`);
                }
            }
            if (typeof def === 'number') {
                if (field.maxValue !== undefined && def > field.maxValue) {
                    report('error', filePath, name, `Default ${def} exceeds maxValue ${field.maxValue}`);
                }
                if (field.minValue !== undefined && def < field.minValue) {
                    report('error', filePath, name, `Default ${def} is below minValue ${field.minValue}`);
                }
            }
            break;

        case 'string':
        case 'emoji':
        case 'imgURL':
        case 'timezone':
            if (field.allowEmbed && typeof def === 'object' && def !== null) {
                // Embed message — validate schema
                if (isValidV3Message(def) || isValidV4Message(def)) {
                    // v3/v4 with explicit _schema are fine
                } else if (looksLikeV3ButMissingSchema(def)) {
                    report('error', filePath, name, `Default looks like a v3 message (has ${Object.keys(def).filter(k => ['embeds', 'content', 'buttons', 'linkButtons'].includes(k)).join(', ')}) but is missing "_schema": "v3" — will be parsed as v2`);
                } else if (!isValidV2Embed(def)) {
                    report('error', filePath, name, `Default is an object (embed) but has invalid v2 message schema. Keys: ${JSON.stringify(Object.keys(def))}`);
                }
            } else if (typeof def !== 'string') {
                if (field.allowEmbed) {
                    report('error', filePath, name, `Type is "${field.type}" (allowEmbed) but default is ${typeof def}, not a string or valid embed object`);
                } else if (typeof def === 'object' && def !== null && !Array.isArray(def)) {
                    report('error', filePath, name, `Type is "${field.type}" but default is an object — missing "allowEmbed: true"?`);
                } else {
                    report('error', filePath, name, `Type is "${field.type}" but default is ${JSON.stringify(def)} (${typeof def})`);
                }
            }
            break;

        case 'array':
            if (!Array.isArray(def)) {
                report('error', filePath, name, `Type is "array" but default is ${JSON.stringify(def)} (${typeof def})`);
            }
            if (!field.content) {
                report('warn', filePath, name, 'Array field is missing "content" (element type)');
            }
            break;

        case 'keyed':
            if (typeof def !== 'object' || def === null || Array.isArray(def)) {
                report('error', filePath, name, `Type is "keyed" but default is ${JSON.stringify(def)} (${typeof def})`);
            }
            if (!field.content) {
                report('warn', filePath, name, 'Keyed field is missing "content" (key/value types)');
            }
            break;

        case 'select':
            if (!field.content || !Array.isArray(field.content)) {
                report('error', filePath, name, 'Select field is missing "content" options array');
            } else {
                const options = typeof field.content[0] !== 'string'
                    ? field.content.map(f => f.value)
                    : field.content;
                if (def !== '' && def !== null && !options.includes(def)) {
                    report('error', filePath, name, `Default "${def}" is not in select options: [${options.join(', ')}]`);
                }
            }
            break;

        case 'channelID':
        case 'roleID':
        case 'userID':
        case 'guildID':
            // These are typically empty strings as defaults (filled at runtime)
            if (def !== '' && def !== null && typeof def !== 'string') {
                report('error', filePath, name, `Type is "${field.type}" but default is ${JSON.stringify(def)} (${typeof def})`);
            }
            break;
    }

}

function verifyConfigFile(filePath) {
    filesChecked++;
    let data;
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        report('error', filePath, null, `Failed to parse JSON: ${e.message}`);
        return;
    }

    const relPath = path.relative(process.cwd(), filePath);

    if (!data.content || !Array.isArray(data.content)) {
        report('warn', relPath, null, 'No "content" array found — skipping field checks');
        return;
    }

    if (!data.filename) {
        report('warn', relPath, null, 'Missing "filename" property');
    }

    const fieldNames = new Set(data.content.map(f => f.name));

    for (const field of data.content) {
        verifyField(relPath, field);

        // Verify dependsOn references
        if (field.dependsOn && !fieldNames.has(field.dependsOn)) {
            report('error', relPath, field.name, `dependsOn references non-existent field "${field.dependsOn}"`);
        }
        if (field.dependsOnNot && !fieldNames.has(field.dependsOnNot)) {
            report('error', relPath, field.name, `dependsOnNot references non-existent field "${field.dependsOnNot}"`);
        }

        // Localized defaults are no longer supported
        if (isLocalizedObject(field.default)) {
            report('error', relPath, field.name, `Default uses deprecated localized format (keys: ${Object.keys(field.default).join(', ')}). Run the conversion script to migrate to external config-localizations`);
        }
    }

    // Check for multiple elementToggle fields
    const toggleFields = data.content.filter(f => f.elementToggle);
    if (toggleFields.length > 1) {
        report('error', relPath, toggleFields.map(f => f.name).join(', '), `File has ${toggleFields.length} elementToggle fields — only one is supported. Use dependsOn for additional toggles`);
    }

    // Check for duplicate field names
    const seen = new Set();
    for (const field of data.content) {
        if (field.name && seen.has(field.name)) {
            report('error', relPath, field.name, 'Duplicate field name');
        }
        seen.add(field.name);
    }
}

function discoverConfigFiles() {
    const configFiles = [];

    // Core config-generator files
    const generatorDir = path.join(__dirname, '..', 'config-generator');
    if (fs.existsSync(generatorDir)) {
        for (const f of fs.readdirSync(generatorDir)) {
            if (f.endsWith('.json')) {
                configFiles.push(path.join(generatorDir, f));
            }
        }
    }

    // Module config files (discovered via module.json)
    const modulesDir = path.join(__dirname, '..', 'modules');
    for (const moduleName of fs.readdirSync(modulesDir)) {
        const moduleJsonPath = path.join(modulesDir, moduleName, 'module.json');
        if (!fs.existsSync(moduleJsonPath)) continue;

        let moduleJson;
        try {
            moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
        } catch {
            report('error', `modules/${moduleName}/module.json`, null, 'Failed to parse module.json');
            continue;
        }

        const exampleFiles = moduleJson['config-example-files'] || [];
        for (const f of exampleFiles) {
            const cfgPath = path.join(modulesDir, moduleName, f);
            if (fs.existsSync(cfgPath)) {
                configFiles.push(cfgPath);
            } else {
                report('error', `modules/${moduleName}/${f}`, null, 'Config example file listed in module.json but does not exist');
            }
        }
    }

    return configFiles;
}

// Main
console.log('\n\x1b[1mVerifying config file default values...\x1b[0m\n');

const configFiles = discoverConfigFiles();

for (const filePath of configFiles) {
    verifyConfigFile(filePath);
}

console.log(`\n\x1b[1mResults:\x1b[0m ${filesChecked} files, ${fieldsChecked} fields checked`);
if (errors > 0) {
    console.log(`  \x1b[31m${errors} error(s)\x1b[0m`);
}
if (warnings > 0) {
    console.log(`  \x1b[33m${warnings} warning(s)\x1b[0m`);
}
if (errors === 0 && warnings === 0) {
    console.log('  \x1b[32mAll checks passed!\x1b[0m');
}

console.log('');
process.exit(errors > 0 ? 1 : 0);
