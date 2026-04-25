/**
 * Locale utilities for config-localizations JSON files.
 *
 * Exports:
 *   localize(stringName, locale, dir)
 *     Look up a single localized value by dot-path.
 *
 *   getLocalizedConfig(configName, moduleName, locale, rootCustomBotDir)
 *     Return a full config file with all values localized.
 *
 * Usage:
 *   const { localize, getLocalizedConfig } = require('./config-localizations/getLocale');
 *
 *   localize('moderation.strings.content.ban_message.default', 'de', '/path/to/branch/config-localizations');
 *
 *   getLocalizedConfig('configs/config.json', 'moderation', 'de', '/path/to/bot');
 *   getLocalizedConfig('config.json', null, 'de', '/path/to/bot');  // core config
 */

const fs = require('fs');
const path = require('path');

/** Cache TTL in ms (5 minutes). */
const CACHE_TTL = 5 * 60 * 1000;

// Keyed by "dir\0locale" to keep per-directory caches separate.
const cache = {};

/**
 * Load and cache a locale file from a given directory.
 * Re-reads from disk if the cache entry is older than CACHE_TTL.
 */
function loadLocale(dir, locale) {
    const key = dir + '\0' + locale;
    const entry = cache[key];
    if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
    const filePath = path.join(dir, `${locale}.json`);
    let data = null;
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* missing/unreadable file → null */
    }
    cache[key] = {
        data,
        ts: Date.now()
    };
    return data;
}

/**
 * Walk an object by a dot-separated path. Returns undefined on miss.
 */
function resolve(obj, dotPath) {
    const keys = dotPath.split('.');
    let current = obj;
    for (const key of keys) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[key];
    }
    return current;
}

/**
 * Look up a localized string by dot-path.
 *
 * @param {string} stringName  Dot-separated path, e.g. "moderation.strings.content.ban_message.default"
 * @param {string} [locale]    BCP-47 language code (e.g. "de"). Falls back to "en".
 * @param {string} [dir]       Directory containing the locale JSON files. Defaults to this file's directory.
 * @returns {*} The resolved value, or undefined if not found.
 */
function localize(stringName, locale, dir) {
    const configDir = dir || __dirname;
    if (locale && locale !== 'en') {
        const locData = loadLocale(configDir, locale);
        if (locData) {
            const value = resolve(locData, stringName);
            if (value !== undefined) return value;
        }
    }
    const enData = loadLocale(configDir, 'en');
    if (!enData) return undefined;
    return resolve(enData, stringName);
}

/**
 * Return a full config example file with all values replaced by their
 * localized equivalents. Falls back to English for missing translations.
 *
 * @param {string} configName       Path to the config file relative to the module dir
 *                                  (e.g. "configs/config.json"). For core configs, relative
 *                                  to config-generator/ (e.g. "config.json").
 * @param {string|null} moduleName  Module name (e.g. "moderation"), or null for core configs.
 * @param {string} locale           BCP-47 language code (e.g. "de"). Falls back to "en".
 * @param {string} rootCustomBotDir Root directory of the custom bot installation.
 * @returns {object|null} The localized config object, or null if the file doesn't exist.
 */
function getLocalizedConfig(configName, moduleName, locale, rootCustomBotDir) {
    const configPath = moduleName
        ? path.join(rootCustomBotDir, 'modules', moduleName, configName)
        : path.join(rootCustomBotDir, 'config-generator', configName);

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
        return null;
    }
    config = JSON.parse(JSON.stringify(config));

    if (!locale || locale === 'en') return config;

    const locDir = path.join(rootCustomBotDir, 'config-localizations');
    const locData = loadLocale(locDir, locale);
    const enData = loadLocale(locDir, 'en');

    const scope = moduleName || '_core';
    const fileKey = path.basename(configName, '.json');
    const fileLoc = locData && locData[scope] && locData[scope][fileKey];

    if (!fileLoc) return config;

    const enFile = enData && enData[scope] && enData[scope][fileKey];

    function pick(locObj, enObj, key, original) {
        if (locObj && locObj[key] !== undefined) return locObj[key];
        if (enObj && enObj[key] !== undefined) return enObj[key];
        return original;
    }

    // Top-level metadata
    for (const key of ['humanName', 'description', 'informationBanner']) {
        if (fileLoc[key] !== undefined) config[key] = fileLoc[key];
    }

    // configElementName (e.g. { one: "punishment", more: "punishments" })
    if (fileLoc.configElementName && config.configElementName) {
        const locCE = fileLoc.configElementName;
        const enCE = enFile && enFile.configElementName;
        for (const k of Object.keys(config.configElementName)) {
            config.configElementName[k] = pick(locCE, enCE, k, config.configElementName[k]);
        }
    }

    // Categories — config: [{id, displayName, ...}], locale: {id: {displayName}}
    if (fileLoc.categories && Array.isArray(config.categories)) {
        const enCats = enFile && enFile.categories;
        for (const cat of config.categories) {
            const catLoc = fileLoc.categories[cat.id];
            const catEn = enCats && enCats[cat.id];
            if (catLoc || catEn) {
                cat.displayName = pick(catLoc, catEn, 'displayName', cat.displayName);
            }
        }
    }

    // Content fields — config: [{name, humanName, ...}], locale: {name: {humanName, ...}}
    if (fileLoc.content && Array.isArray(config.content)) {
        const enContent = enFile && enFile.content;
        for (const field of config.content) {
            const fLoc = fileLoc.content[field.name];
            const fEn = enContent && enContent[field.name];
            if (!fLoc && !fEn) continue;

            for (const key of ['humanName', 'description', 'default']) {
                const val = pick(fLoc, fEn, key, undefined);
                if (val !== undefined) field[key] = val;
            }

            // Params — config: [{name, description}], locale: {name: {description}}
            if (Array.isArray(field.params) && (fLoc && fLoc.params || fEn && fEn.params)) {
                const pLoc = fLoc && fLoc.params;
                const pEn = fEn && fEn.params;
                for (const param of field.params) {
                    const paramLoc = pLoc && pLoc[param.name];
                    const paramEn = pEn && pEn[param.name];
                    if (paramLoc || paramEn) {
                        param.description = pick(paramLoc, paramEn, 'description', param.description);
                    }
                }
            }
        }
    }

    return config;
}

/**
 * List config files for a module with localized metadata.
 *
 * @param {string} locale           BCP-47 language code (e.g. "de"). Falls back to "en".
 * @param {string} moduleName       Module directory name (e.g. "moderation").
 * @param {string} rootCustomBotDir Root directory of the custom bot installation.
 * @returns {Array<{filename: string, humanName: string, description: string, fieldCount: number}>|null}
 *          Array of config summaries, or null if the module doesn't exist.
 */
function listLocalizedConfigs(locale, moduleName, rootCustomBotDir) {
    const mjPath = path.join(rootCustomBotDir, 'modules', moduleName, 'module.json');
    let mj;
    try {
        mj = JSON.parse(fs.readFileSync(mjPath, 'utf-8'));
    } catch {
        return null;
    }

    const configFiles = mj['config-example-files'];
    if (!Array.isArray(configFiles) || configFiles.length === 0) return [];

    const locDir = path.join(rootCustomBotDir, 'config-localizations');
    const locData = locale && locale !== 'en' ? loadLocale(locDir, locale) : null;
    const enData = loadLocale(locDir, 'en');

    function pickVal(locObj, enObj, key, fallback) {
        if (locObj && locObj[key] !== undefined) return locObj[key];
        if (enObj && enObj[key] !== undefined) return enObj[key];
        return fallback;
    }

    const result = [];
    for (const cfgPath of configFiles) {
        const fullPath = path.join(rootCustomBotDir, 'modules', moduleName, cfgPath);
        let cfg;
        try {
            cfg = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        } catch {
            continue;
        }

        const fileKey = path.basename(cfgPath, '.json');
        const fileLoc = locData && locData[moduleName] && locData[moduleName][fileKey];
        const fileEn = enData && enData[moduleName] && enData[moduleName][fileKey];

        result.push({
            filename: cfgPath,
            humanName: pickVal(fileLoc, fileEn, 'humanName', cfg.humanName || fileKey),
            description: pickVal(fileLoc, fileEn, 'description', cfg.description || ''),
            fieldCount: Array.isArray(cfg.content) ? cfg.content.length : 0
        });
    }

    return result;
}

/**
 * List all config files for every module with localized metadata.
 *
 * @param {string} locale           BCP-47 language code (e.g. "de"). Falls back to "en".
 * @param {string} rootCustomBotDir Root directory of the custom bot installation.
 * @returns {Array<{moduleName: string, humanReadableName: string, moduleDescription: string, configs: Array<{filename: string, humanName: string, description: string, fieldCount: number}>}>}
 */
function listAllLocalizedConfigs(locale, rootCustomBotDir) {
    const modulesDir = path.join(rootCustomBotDir, 'modules');
    let moduleDirs;
    try {
        moduleDirs = fs.readdirSync(modulesDir).sort();
    } catch {
        return [];
    }

    const locDir = path.join(rootCustomBotDir, 'config-localizations');
    const locData = loadLocale(locDir, locale && locale !== 'en' ? locale : null);
    const enData = loadLocale(locDir, 'en');

    function pickVal(locScope, enScope, key, fallback) {
        if (locScope && locScope[key] !== undefined) return locScope[key];
        if (enScope && enScope[key] !== undefined) return enScope[key];
        return fallback;
    }

    const result = [];

    for (const mod of moduleDirs) {
        const mjPath = path.join(modulesDir, mod, 'module.json');
        let mj;
        try {
            mj = JSON.parse(fs.readFileSync(mjPath, 'utf-8'));
        } catch {
            continue;
        }

        const configFiles = mj['config-example-files'];
        if (!Array.isArray(configFiles) || configFiles.length === 0) continue;

        // Localized module metadata
        const modLoc = locData && locData[mod] && locData[mod]._module;
        const modEn = enData && enData[mod] && enData[mod]._module;

        const entry = {
            moduleName: mod,
            humanReadableName: pickVal(modLoc, modEn, 'humanReadableName', mj.humanReadableName || mod),
            moduleDescription: pickVal(modLoc, modEn, 'description', mj.description || ''),
            configs: []
        };

        for (const cfgPath of configFiles) {
            const fullPath = path.join(modulesDir, mod, cfgPath);
            let cfg;
            try {
                cfg = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
            } catch {
                continue;
            }

            const fileKey = path.basename(cfgPath, '.json');
            const fileLoc = locData && locData[mod] && locData[mod][fileKey];
            const fileEn = enData && enData[mod] && enData[mod][fileKey];

            entry.configs.push({
                name: cfgPath.replaceAll('.json', ''),
                filename: cfgPath.replaceAll('.json', '').replaceAll('configs/', ''),
                humanName: pickVal(fileLoc, fileEn, 'humanName', cfg.humanName || fileKey),
                description: pickVal(fileLoc, fileEn, 'description', cfg.description || ''),
                fieldCount: Array.isArray(cfg.content) ? cfg.content.length : 0
            });
        }

        result.push(entry);
    }

    return result;
}

/**
 * Return all modules with localized humanReadableName and description,
 * plus static metadata from module.json. The author field is redacted to
 * only { scnxOrgID } when a scnxOrgID is present.
 *
 * @param {string} rootCustomBotDir Root directory of the custom bot installation.
 * @returns {Array<object>} Array of module summary objects.
 */
function localizedModules(rootCustomBotDir) {
    const modulesDir = path.join(rootCustomBotDir, 'modules');
    let moduleDirs;
    try {
        moduleDirs = fs.readdirSync(modulesDir).sort();
    } catch {
        return [];
    }

    const locDir = path.join(rootCustomBotDir, 'config-localizations');
    const enData = loadLocale(locDir, 'en');

    // Collect all available locales
    const locales = {};
    try {
        for (const file of fs.readdirSync(locDir)) {
            if (file.endsWith('.json')) {
                const loc = file.replace('.json', '');
                locales[loc] = loadLocale(locDir, loc);
            }
        }
    } catch { /* no localization dir */
    }

    const result = [];

    for (const mod of moduleDirs) {
        const mjPath = path.join(modulesDir, mod, 'module.json');
        let mj;
        try {
            mj = JSON.parse(fs.readFileSync(mjPath, 'utf-8'));
        } catch {
            continue;
        }

        if (mj.hidden) continue;

        // Build localized humanReadableName and description across all locales
        const humanReadableName = {};
        const description = {};
        const legalDisclaimer = {};

        for (const [loc, data] of Object.entries(locales)) {
            const modLoc = data && data[mod] && data[mod]._module;
            if (modLoc && modLoc.humanReadableName !== undefined) {
                humanReadableName[loc] = modLoc.humanReadableName;
            }
            if (modLoc && modLoc.description !== undefined) {
                description[loc] = modLoc.description;
            }
            if (modLoc && modLoc.legalDisclaimer !== undefined) {
                legalDisclaimer[loc] = modLoc.legalDisclaimer;
            }
        }

        // English fallback from the file itself
        if (!humanReadableName.en) humanReadableName.en = mj.humanReadableName || mod;
        if (!description.en) description.en = mj.description || '';
        if (!legalDisclaimer.en && mj.legalDisclaimer) legalDisclaimer.en = mj.legalDisclaimer;

        // Author: redact to just scnxOrgID when it's set
        let author = mj.author;
        if (author && author.scnxOrgID) {
            author = {scnxOrgID: author.scnxOrgID};
        }

        // Config file count
        const configFiles = mj['config-example-files'];
        const configFileCount = Array.isArray(configFiles) ? configFiles.length : 0;

        // Command count: count .js files in commands-dir
        let commandCount = 0;
        if (mj['commands-dir']) {
            const cmdDir = path.join(modulesDir, mod, mj['commands-dir']);
            try {
                commandCount = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js')).length;
            } catch { /* no commands dir */
            }
        }

        // Has database models
        let hasDB = false;
        if (mj['models-dir']) {
            const modelsDir = path.join(modulesDir, mod, mj['models-dir']);
            try {
                hasDB = fs.readdirSync(modelsDir).some(f => f.endsWith('.js'));
            } catch { /* no models dir */
            }
        }

        const entry = {
            name: mj.name || mod,
            humanReadableName,
            description,
            tags: mj.tags || [],
            'fa-icon': mj['fa-icon'] || '',
            author,
            openSourceURL: mj.openSourceURL || null,
            usesAICredits: mj.usesAICredits || false,
            earlyAccess: mj.earlyAccess || false,
            commandsCount: commandCount,
            configFileCount,
            hasDB
        };

        if (Object.keys(legalDisclaimer).length > 0) entry.legalDisclaimer = legalDisclaimer;

        result.push(entry);
    }

    return result;
}

module.exports = {
    localize,
    getLocalizedConfig,
    listAllLocalizedConfigs,
    listLocalizedConfigs,
    localizedModules
};