/**
 * Converts all config JSON files from inline localization format to English-only format.
 *
 * Reads module.json config-example-files to discover ALL config files per module.
 *
 * Before: { "description": { "en": "Configure here", "de": "Konfigurieren" } }
 * After:  { "description": "Configure here" }
 *
 * For default values, the {en: value} wrapper is removed for ALL types:
 *   { "default": { "en": false } } → { "default": false }
 *   { "default": { "en": "Hello" } } → { "default": "Hello" }
 *
 * Usage: node config-localizations/convert-configs.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

let filesModified = 0;
let fieldsConverted = 0;

/**
 * Check if a value is a localized object ({en: ..., de: ...}).
 */
function isLocalizedObject(value) {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    if (!('en' in value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every(k => /^[a-z]{2,3}$/.test(k));
}

/**
 * Unwrap a localized object to its English value.
 */
function unwrap(value) {
    if (isLocalizedObject(value)) {
        fieldsConverted++;
        return value.en;
    }
    return value;
}

/**
 * Recursively unwrap all localized objects within a nested structure.
 */
function recursiveUnwrap(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return;
    for (const key of Object.keys(obj)) {
        if (isLocalizedObject(obj[key])) {
            obj[key] = unwrap(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            recursiveUnwrap(obj[key]);
        }
    }
}

/**
 * Process a single config file, converting all localized objects to English-only.
 */
function convertConfig(configData) {
    // Top-level localized properties
    for (const key of ['description', 'humanName', 'warningBanner', 'informationBanner']) {
        if (isLocalizedObject(configData[key])) {
            configData[key] = unwrap(configData[key]);
        }
    }

    // informationBanner may have nested localized objects (e.g. button.text)
    if (configData.informationBanner && typeof configData.informationBanner === 'object' && !isLocalizedObject(configData.informationBanner)) {
        recursiveUnwrap(configData.informationBanner);
    }

    // configElementName: {en: {one: ..., more: ...}, de: {...}} → {one: ..., more: ...}
    if (isLocalizedObject(configData.configElementName)) {
        configData.configElementName = unwrap(configData.configElementName);
    }

    // commandsWarnings.special[].info
    if (configData.commandsWarnings && Array.isArray(configData.commandsWarnings.special)) {
        for (const warning of configData.commandsWarnings.special) {
            if (isLocalizedObject(warning.info)) {
                warning.info = unwrap(warning.info);
            }
        }
    }

    // categories[].displayName
    if (Array.isArray(configData.categories)) {
        for (const cat of configData.categories) {
            if (isLocalizedObject(cat.displayName)) {
                cat.displayName = unwrap(cat.displayName);
            }
        }
    }

    // content fields
    if (Array.isArray(configData.content)) {
        for (const field of configData.content) {
            convertField(field);
        }
    }

    return configData;
}

/**
 * Convert a single content field.
 */
function convertField(field) {
    // humanName, description — always localized
    for (const key of ['humanName', 'description']) {
        if (isLocalizedObject(field[key])) {
            field[key] = unwrap(field[key]);
        }
    }

    // default — unwrap {en: value} for ALL types
    if (isLocalizedObject(field.default)) {
        field.default = unwrap(field.default);
    }

    // params[].description
    if (Array.isArray(field.params)) {
        for (const param of field.params) {
            if (isLocalizedObject(param.description)) {
                param.description = unwrap(param.description);
            }
        }
    }

    // select content[].displayName (when content is array of objects)
    if (Array.isArray(field.content) && field.content.length > 0 && typeof field.content[0] === 'object' && field.content[0] !== null) {
        for (const option of field.content) {
            if (option && isLocalizedObject(option.displayName)) {
                option.displayName = unwrap(option.displayName);
            }
        }
    }

    // links[].label
    if (Array.isArray(field.links)) {
        for (const link of field.links) {
            if (isLocalizedObject(link.label)) {
                link.label = unwrap(link.label);
            }
        }
    }
}

/**
 * Process a config file at the given path.
 */
function processFile(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
        console.warn(`  Skipping ${filePath}: ${e.message}`);
        return;
    }

    let configData;
    try {
        configData = JSON.parse(raw);
    } catch (e) {
        console.warn(`  Skipping ${filePath}: invalid JSON`);
        return;
    }

    // Skip non-config files
    if (Array.isArray(configData) && !configData.content) return;
    if (!configData.content && !configData.description && !configData.humanName) return;

    const beforeCount = fieldsConverted;
    convertConfig(configData);
    const changed = fieldsConverted - beforeCount;

    if (changed > 0) {
        const output = JSON.stringify(configData, null, 2);
        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would modify ${filePath} (${changed} fields)`);
        } else {
            fs.writeFileSync(filePath, output);
            console.log(`  Modified ${filePath} (${changed} fields)`);
        }
        filesModified++;
    }
}

// Process config-generator files
console.log('Converting config-generator/...');
const coreDir = path.join(ROOT, 'config-generator');
if (fs.existsSync(coreDir)) {
    for (const file of fs.readdirSync(coreDir).sort()) {
        if (!file.endsWith('.json')) continue;
        processFile(path.join(coreDir, file));
    }
}

// Process module config files using module.json
console.log('Converting modules/...');
const modulesDir = path.join(ROOT, 'modules');
for (const moduleName of fs.readdirSync(modulesDir).sort()) {
    const moduleDir = path.join(modulesDir, moduleName);
    if (!fs.statSync(moduleDir).isDirectory()) continue;

    const moduleJsonPath = path.join(moduleDir, 'module.json');
    if (!fs.existsSync(moduleJsonPath)) continue;

    let moduleJson;
    try {
        moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
    } catch (e) {
        console.warn(`  Skipping ${moduleName}: invalid module.json`);
        continue;
    }

    // Convert module.json humanReadableName, description, legalDisclaimer
    let mjChanged = false;
    for (const key of ['humanReadableName', 'description', 'legalDisclaimer']) {
        if (isLocalizedObject(moduleJson[key])) {
            moduleJson[key] = unwrap(moduleJson[key]);
            mjChanged = true;
        }
    }
    if (mjChanged) {
        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would modify ${moduleName}/module.json`);
        } else {
            fs.writeFileSync(moduleJsonPath, JSON.stringify(moduleJson, null, 2) + '\n');
            console.log(`  Modified ${moduleName}/module.json`);
        }
        filesModified++;
    }

    // Convert config files
    const configFiles = moduleJson['config-example-files'] || [];
    for (const configFile of configFiles) {
        const filePath = path.join(moduleDir, configFile);
        if (!fs.existsSync(filePath)) {
            console.warn(`  Warning: ${moduleName}/${configFile} listed in module.json but not found`);
            continue;
        }
        processFile(filePath);
    }
}

console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Done! ${filesModified} files modified, ${fieldsConverted} fields converted.`);
if (DRY_RUN) console.log('Run without --dry-run to apply changes.');
