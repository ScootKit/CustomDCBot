/**
 * Extracts English strings from all config JSON files and generates
 * config-localizations/en.json for use as the Weblate reference file.
 *
 * Reads module.json config-example-files to discover ALL config files per module.
 * Config files use inline English-only values (plain strings). This script
 * extracts them into a structured JSON file that translators can work with.
 *
 * Also reports warnings for missing humanName/description fields and shows
 * how many new strings were added compared to the previous en.json.
 *
 * Usage: node config-localizations/generate-files.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = __dirname;
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'en.json');

const extracted = {};
const warnings = [];

// Load previous en.json for comparison
let previousData = {};
try {
    previousData = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
} catch (e) {
    // No previous file — everything will be new
}

/**
 * Extract English strings from a config file's top-level and content fields.
 */
function extractFromConfig(configData, filePath) {
    const result = {};

    // Top-level fields
    for (const key of ['description', 'humanName', 'warningBanner']) {
        if (typeof configData[key] === 'string' && configData[key].length > 0) {
            result[key] = configData[key];
        }
    }

    // Warn about missing top-level fields
    if (!configData.humanName) {
        warnings.push(`${filePath}: Missing top-level "humanName"`);
    }
    if (!configData.description) {
        warnings.push(`${filePath}: Missing top-level "description"`);
    }

    // informationBanner: can be a string or a complex object with nested strings
    if (configData.informationBanner) {
        if (typeof configData.informationBanner === 'string') {
            result.informationBanner = configData.informationBanner;
        } else if (typeof configData.informationBanner === 'object') {
            result.informationBanner = configData.informationBanner;
        }
    }

    // configElementName: after conversion, this is {one: "...", more: "..."} or a string
    if (configData.configElementName) {
        if (typeof configData.configElementName === 'string') {
            result.configElementName = configData.configElementName;
        } else if (typeof configData.configElementName === 'object' && !Array.isArray(configData.configElementName)) {
            result.configElementName = configData.configElementName;
        }
    }

    // commandsWarnings.special[].info
    if (configData.commandsWarnings && Array.isArray(configData.commandsWarnings.special)) {
        const cmdWarnings = {};
        for (const warning of configData.commandsWarnings.special) {
            if (typeof warning.info === 'string' && warning.info.length > 0) {
                cmdWarnings[warning.name] = {info: warning.info};
            }
        }
        if (Object.keys(cmdWarnings).length > 0) result.commandsWarnings = cmdWarnings;
    }

    // categories[].displayName
    if (Array.isArray(configData.categories)) {
        const categories = {};
        for (const cat of configData.categories) {
            if (typeof cat.displayName === 'string' && cat.displayName.length > 0) {
                categories[cat.id] = {displayName: cat.displayName};
            } else if (!cat.displayName) {
                warnings.push(`${filePath}: Category "${cat.id}" missing "displayName"`);
            }
        }
        if (Object.keys(categories).length > 0) result.categories = categories;
    }

    // content fields
    if (Array.isArray(configData.content)) {
        const contentResult = {};
        for (const field of configData.content) {
            const fieldResult = extractFromField(field, filePath);
            if (Object.keys(fieldResult).length > 0) {
                contentResult[field.name] = fieldResult;
            }
        }
        if (Object.keys(contentResult).length > 0) result.content = contentResult;
    }

    return result;
}

/**
 * Extract English strings from a single content field.
 */
function extractFromField(field, filePath) {
    const result = {};

    // humanName and description
    for (const key of ['humanName', 'description']) {
        if (typeof field[key] === 'string' && field[key].length > 0) {
            result[key] = field[key];
        }
    }

    // Warn about missing required field properties
    if (!field.humanName) {
        warnings.push(`${filePath}: Field "${field.name}" missing "humanName"`);
    }
    if (!field.description) {
        warnings.push(`${filePath}: Field "${field.name}" missing "description"`);
    }

    // Only extract defaults for localizable types
    if (['string', 'emoji', 'imgURL'].includes(field.type)) {
        if (typeof field.default === 'string') {
            result.default = field.default;
        } else if (field.default && typeof field.default === 'object' && !Array.isArray(field.default)) {
            // Embed default object (with title, description, etc.)
            result.default = field.default;
        }
    }

    // params[].description
    if (Array.isArray(field.params)) {
        const params = {};
        for (const param of field.params) {
            if (typeof param.description === 'string' && param.description.length > 0) {
                params[param.name] = {description: param.description};
            } else if (!param.description) {
                warnings.push(`${filePath}: Field "${field.name}" param "${param.name}" missing "description"`);
            }
        }
        if (Object.keys(params).length > 0) result.params = params;
    }

    // select content[].displayName (when content is array of objects)
    if (Array.isArray(field.content) && field.content.length > 0 && typeof field.content[0] === 'object' && field.content[0] !== null) {
        const selectOptions = {};
        for (const option of field.content) {
            if (option && typeof option.displayName === 'string' && option.displayName.length > 0) {
                selectOptions[option.value] = {displayName: option.displayName};
            } else if (option && !option.displayName) {
                warnings.push(`${filePath}: Field "${field.name}" select option "${option.value}" missing "displayName"`);
            }
        }
        if (Object.keys(selectOptions).length > 0) result.selectOptions = selectOptions;
    }

    // links[].label
    if (Array.isArray(field.links)) {
        const links = {};
        for (let i = 0; i < field.links.length; i++) {
            if (typeof field.links[i].label === 'string' && field.links[i].label.length > 0) {
                links[field.links[i].url || i] = {label: field.links[i].label};
            }
        }
        if (Object.keys(links).length > 0) result.links = links;
    }

    return result;
}

/**
 * Count all leaf string values in a nested object.
 */
function countStrings(obj) {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj === 'string') return 1;
    if (typeof obj !== 'object') return 0;
    if (Array.isArray(obj)) return obj.reduce((sum, v) => sum + countStrings(v), 0);
    return Object.values(obj).reduce((sum, v) => sum + countStrings(v), 0);
}

/**
 * Process a single config JSON file.
 */
function processFile(filePath, scope, fileName) {
    let configData;
    try {
        configData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.warn(`  Skipping ${filePath}: ${e.message}`);
        return;
    }

    // Skip non-config files
    if (Array.isArray(configData) && !configData.content) return;
    if (!configData.content && !configData.description && !configData.humanName) return;

    const result = extractFromConfig(configData, `${scope}/${fileName}.json`);
    if (Object.keys(result).length === 0) return;

    if (!extracted[scope]) extracted[scope] = {};
    extracted[scope][fileName] = result;
}

// Process config-generator files
console.log('Scanning config-generator/...');
const coreDir = path.join(ROOT, 'config-generator');
if (fs.existsSync(coreDir)) {
    for (const file of fs.readdirSync(coreDir).sort()) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(coreDir, file);
        const fileName = file.replace('.json', '');
        console.log(`  ${file}`);
        processFile(filePath, '_core', fileName);
    }
}

// Process module config files using module.json
console.log('Scanning modules/...');
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

    // Extract module.json metadata (humanReadableName, description)
    const moduleMetadata = {};
    if (typeof moduleJson.humanReadableName === 'string' && moduleJson.humanReadableName.length > 0) {
        moduleMetadata.humanReadableName = moduleJson.humanReadableName;
    } else if (!moduleJson.humanReadableName) {
        warnings.push(`${moduleName}/module.json: Missing "humanReadableName"`);
    }
    if (typeof moduleJson.description === 'string' && moduleJson.description.length > 0) {
        moduleMetadata.description = moduleJson.description;
    } else if (!moduleJson.description) {
        warnings.push(`${moduleName}/module.json: Missing "description"`);
    }
    if (typeof moduleJson.legalDisclaimer === 'string' && moduleJson.legalDisclaimer.length > 0) {
        moduleMetadata.legalDisclaimer = moduleJson.legalDisclaimer;
    }
    if (typeof moduleJson.enableWarning === 'string' && moduleJson.enableWarning.length > 0) {
        moduleMetadata.enableWarning = moduleJson.enableWarning;
    }
    if (Object.keys(moduleMetadata).length > 0) {
        if (!extracted[moduleName]) extracted[moduleName] = {};
        extracted[moduleName]['_module'] = moduleMetadata;
    }

    // Extract config files
    const configFiles = moduleJson['config-example-files'] || [];
    for (const configFile of configFiles) {
        const filePath = path.join(moduleDir, configFile);
        if (!fs.existsSync(filePath)) {
            console.warn(`  Warning: ${moduleName}/${configFile} listed in module.json but not found`);
            continue;
        }
        const fileName = path.basename(configFile, '.json');
        console.log(`  ${moduleName}/${configFile}`);
        processFile(filePath, moduleName, fileName);
    }
}

// Count strings
const totalStrings = countStrings(extracted);
const previousStrings = countStrings(previousData);

// Write en.json
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(extracted, null, 2) + '\n');
const scopeCount = Object.keys(extracted).length;
let fieldCount = 0;
for (const scope of Object.values(extracted)) {
    for (const file of Object.values(scope)) {
        if (file.content) fieldCount += Object.keys(file.content).length;
    }
}

console.log(`\nWritten ${OUTPUT_PATH}`);
console.log(`  ${scopeCount} scopes, ${fieldCount} content fields`);
console.log(`  ${totalStrings} total strings`);
if (previousStrings > 0) {
    const newStrings = totalStrings - previousStrings;
    if (newStrings > 0) {
        console.log(`  ${newStrings} new strings added since last generation`);
    } else if (newStrings < 0) {
        console.log(`  ${Math.abs(newStrings)} strings removed since last generation`);
    } else {
        console.log(`  No change in string count`);
    }
} else {
    console.log(`  (first generation — all strings are new)`);
}

// Report warnings
if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) {
        console.log(`  - ${w}`);
    }
}

console.log('\nDone!');
