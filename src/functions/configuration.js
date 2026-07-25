/**
 * Handels configuration loading and reloading
 * @module Configuration
 * @author Simon Csaba <mail@scderox.de>
 */
const jsonfile = require('jsonfile');
const fs = require('fs');
const {ChannelType} = require('discord.js');
const {
    logger,
    client
} = require('../../main');
const {localize} = require('./localize');
const {pick} = require('./exitCodes');
const isEqual = require('is-equal');
const path = require('path');
const {
    computeRequiredIntents,
    diffIntents,
    PRIVILEGED_INTENTS
} = require('./intents');

const configLocalizationCache = {};

function loadConfigLocalization(locale) {
    if (configLocalizationCache[locale]) return configLocalizationCache[locale];
    try {
        configLocalizationCache[locale] = JSON.parse(fs.readFileSync(`${__dirname}/../../config-localizations/${locale}.json`, 'utf-8'));
    } catch (e) {
        configLocalizationCache[locale] = {};
    }
    return configLocalizationCache[locale];
}

function isLocalizedObject(value) {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    if (!('en' in value)) return false;
    return Object.keys(value).every(k => /^[a-z]{2,3}$/.test(k));
}

const channelTypeMap = {
    GUILD_TEXT: ChannelType.GuildText,
    GUILD_CATEGORY: ChannelType.GuildCategory,
    GUILD_NEWS: ChannelType.GuildAnnouncement,
    GUILD_VOICE: ChannelType.GuildVoice,
    GUILD_FORUM: ChannelType.GuildForum,
    GUILD_STAGE_VOICE: ChannelType.GuildStageVoice
};

/*
 * Types whose validity depends on a live Discord fetch. checkType returns false for these on BOTH a
 * genuine not-found AND a transient blip (rate-limit / 5xx / network), which are indistinguishable
 * at the call site, so an invalid stored value must NEVER be healed to the field default.
 */
const FETCH_BACKED_TYPES = new Set(['channelID', 'roleID', 'userID', 'guildID']);

/**
 * True when a field's validity is backed by a live Discord fetch, directly or as an array element.
 * @param {ConfigField<Object>} field
 * @returns {Boolean}
 */
function isFetchBackedType(field) {
    if (FETCH_BACKED_TYPES.has(field.type)) return true;
    return field.type === 'array' && FETCH_BACKED_TYPES.has(field.content);
}

/**
 * Disables every enabled module requiring a privileged intent the operator's allowlist does not
 * grant. Idempotent: reloadConfig resets `enabled` from modules.json first, so this must re-run on
 * every boot AND reload. Returns the disabled module names so the caller can skip their config check.
 * @param {Client} client
 * @param {String} [modulesDir]
 * @returns {Promise<Set<String>>}
 */
async function applyIntentDisables(client, modulesDir) {
    const dir = modulesDir || path.join(__dirname, '..', '..', 'modules');
    const {disabledModules} = computeRequiredIntents(client.configDir, dir);
    const disabled = new Set();
    for (const d of disabledModules) {
        disabled.add(d.module);
        const mod = client.modules[d.module];
        if (!mod) continue;
        mod.enabled = false;
        client.logger.warn(localize('config', 'intent-module-disabled', {
            m: d.module,
            intents: d.missingRequired.join(', ')
        }));
        if (client.scnxSetup) await require('./scnx-integration').reportIssue(client, {
            type: 'MODULE_FAILURE',
            errorDescription: 'module_disabled',
            module: d.module,
            errorData: {reason: 'Required privileged intent(s) not granted: ' + d.missingRequired.join(', ')}
        });
    }
    return disabled;
}

module.exports.applyIntentDisables = applyIntentDisables;

/**
 * Check every (including module) configuration and load them
 * @author Simon Csaba <mail@scderox.de>
 * @param  {Client} client The client
 * @param  {Object} moduleConf Configuration of modules.json
 * @return {Promise}
 */
async function loadAllConfigs(client) {
    logger.info(localize('config', 'checking-config'));
    return new Promise(async (resolve, reject) => {
        fs.readdir(`${__dirname}/../../config-generator`, async (err, files) => {
            for (const f of files) {
                await checkConfigFile(f).catch((reason) => {
                    logger.error(reason);
                    reject(reason);
                });
            }
        });

        const intentDisabled = await applyIntentDisables(client);
        for (const moduleName in client.modules) {
            if (!client.modules[moduleName].userEnabled) continue;
            if (intentDisabled.has(moduleName)) continue; // already disabled + reported above
            await checkModuleConfig(moduleName, client.modules[moduleName]['config']['on-checked-config-event'] ? require(`./modules/${moduleName}/${client.modules[moduleName]['config']['on-checked-config-event']}`) : null)
                .catch(async (e) => {
                    client.modules[moduleName].enabled = false;
                    client.logger.error(`[CONFIGURATION] ERROR CHECKING ${moduleName}. Module disabled internally. Error: ${e}`);
                    if (client.scnxSetup) await require('./scnx-integration').reportIssue(client, {
                        type: 'MODULE_FAILURE',
                        errorDescription: 'module_disabled',
                        module: moduleName,
                        errorData: {reason: 'Invalid configuration: ' + e}
                    });
                });
        }
        const data = {
            totalModules: Object.keys(client.modules).length,
            enabled: Object.values(client.modules).filter(m => m.enabled).length,
            configDisabled: Object.values(client.modules).filter(m => m.userEnabled && !m.enabled).length,
            userEnabled: Object.values(client.modules).filter(m => m.userEnabled && !m.enabled).length
        };
        logger.info(localize('config', 'done-with-checking', data));
        resolve(data);
    });
}

/**
 *
 */
async function checkConfigFile(file, moduleName) {
    const {client} = require('../../main');
    return new Promise(async (resolve, reject) => {
        const builtIn = !moduleName;
        let exampleFile;
        try {
            exampleFile = require(builtIn ? `${__dirname}/../../config-generator/${file}` : `${__dirname}/../../modules/${moduleName}/${file}`);
        } catch (e) {
            logger.error(`Not found config example file: ${file}`);
            return reject(`Not found config example file: ${file}`);
        }
        if (!exampleFile) return;
        const locScope = builtIn ? '_core' : moduleName;
        const locFileName = exampleFile.filename.replace('.json', '');

        /**
         * Detaches a default value from the shared example/localization caches. Object and array
         * defaults are returned by reference from module-cached JSON, so materialized configs alias
         * them and any in-place mutation would corrupt the cache for every later load.
         * @param {*} value Default value to detach
         * @returns {*} A cache-independent copy; primitives pass through
         */
        function detachDefault(value) {
            if (value !== null && typeof value === 'object') return structuredClone(value);
            return value;
        }

        function resolveDefault(field) {
            if (isLocalizedObject(field.default)) {
                return detachDefault(field.default[client.locale] || field.default['en']);
            }
            if (['string', 'emoji', 'imgURL'].includes(field.type) && client.locale && client.locale !== 'en') {
                const locData = loadConfigLocalization(client.locale);
                const fileLocData = locData[locScope] && locData[locScope][locFileName];
                if (fileLocData && fileLocData.content && fileLocData.content[field.name] &&
                    fileLocData.content[field.name].default !== undefined) {
                    return detachDefault(fileLocData.content[field.name].default);
                }
            }
            return detachDefault(field.default);
        }

        /**
         * Resolves a field's dependsOn chain transitively: a field is only enabled when its
         * dependsOn target is truthy AND that target's own chain is satisfied, so a field stays
         * hidden when a hidden ancestor disables it even if the intermediate still holds a stale
         * truthy value.
         * @param {Object} field Field whose chain is being resolved
         * @param {Object} source Config object to read current values from
         * @param {Set<String>} [seen] Cycle guard
         * @returns {Boolean}
         */
        function dependsOnChainSatisfied(field, source, seen = new Set()) {
            if (!field.dependsOn || seen.has(field.name)) return true;
            seen.add(field.name);
            const parent = exampleFile.content.find(f => f.name === field.dependsOn);
            if (!parent) return true; // a missing dependsOn target is rejected separately
            const parentValue = typeof source[parent.name] === 'undefined' ? resolveDefault(parent) : source[parent.name];
            if (!parentValue) return false;
            return dependsOnChainSatisfied(parent, source, seen);
        }

        let forceOverwrite = false;
        let configData = exampleFile.configElements ? [] : {};
        try {
            configData = jsonfile.readFileSync(`${client.configDir}${builtIn ? '' : '/' + moduleName}/${exampleFile.filename}`);
        } catch (e) {
            forceOverwrite = true;
            logger.info(localize('config', 'creating-file', {
                m: builtIn ? 'bot' : moduleName,
                f: exampleFile.filename
            }));
        }
        let newConfig = exampleFile.configElements ? [] : {};
        if (exampleFile.configElements && !Array.isArray(configData)) {
            client.logger.warn(`${builtIn ? '' : '/' + moduleName}/${exampleFile.filename}: This file should be a config-element, but is not. Converting to config-element.`);
            if (typeof configData === 'object') configData = [configData];
            else configData = [];
        }

        let skipOverwrite = false;
        if (exampleFile.skipContentCheck) newConfig = configData;
        else if (exampleFile.configElements) {
            for (const object of configData) {
                const objectData = {};
                for (const field of exampleFile.content) {
                    const dependsOnField = field.dependsOn ? exampleFile.content.find(f => f.name === field.dependsOn) : null;
                    const dependsOnNotField = field.dependsOnNot ? exampleFile.content.find(f => f.name === field.dependsOnNot) : null;
                    if (field.dependsOn && !dependsOnField) return reject(`Depends-On-Field ${field.dependsOn} does not exist.`);
                    if (field.dependsOnNot && !dependsOnNotField) return reject(`Depends-On-Field ${field.dependsOnNotField} does not exist.`);
                    if (dependsOnField && !dependsOnChainSatisfied(field, object)) {
                        objectData[field.name] = configData[field.name] || resolveDefault(field); // Otherwise disabled fields may be overwritten
                        continue;
                    }
                    if (dependsOnNotField && (typeof object[dependsOnNotField.name] === 'undefined' ? resolveDefault(dependsOnNotField) : object[dependsOnNotField.name])) {
                        objectData[field.name] = configData[field.name] || resolveDefault(field); // Otherwise disabled fields may be overwritten
                        continue;
                    }
                    try {
                        objectData[field.name] = await checkField(field, object[field.name]);
                    } catch (e) {
                        reject(e);
                    }
                }
                newConfig.push(objectData);
            }
        } else {
            const elementToggleField = exampleFile.content.find(f => f.elementToggle);
            const elementToggleValue = elementToggleField ? !!(typeof configData[elementToggleField.name] === 'undefined' ? resolveDefault(elementToggleField) : configData[elementToggleField.name]) : true;
            if (!elementToggleValue) skipOverwrite = true;
            for (const field of exampleFile.content) {
                if (!elementToggleValue) {
                    newConfig[field.name] = configData[field.name] !== undefined ? configData[field.name] : resolveDefault(field);
                    continue;
                }
                const dependsOnField = field.dependsOn ? exampleFile.content.find(f => f.name === field.dependsOn) : null;
                if (field.dependsOn && !dependsOnField) return reject(`Depends-On-Field ${field.dependsOn} does not exist.`);
                if (dependsOnField && !dependsOnChainSatisfied(field, configData)) {
                    newConfig[field.name] = configData[field.name] || resolveDefault(field); // Otherwise disabled fields may be overwritten
                    continue;
                }
                try {
                    newConfig[field.name] = await checkField(field, configData[field.name]);
                } catch (e) {
                    if (field.name === 'logChannelID' && builtIn && file === 'config') newConfig[field.name] = null;
                    else return reject(e);
                }
            }
        }

        /**
         * Checks the content of a field
         * @param {Field<Object>} field Field-Object
         * @param {*} fieldValue Current config element
         * @returns {Promise<void|*>}
         */
        function checkField(fieldData, fieldValue) {
            const field = {...fieldData};
            return new Promise(async (res, rej) => {
                if (!field.name) return rej('missing fieldname.');
                if (typeof field.default === 'undefined') {
                    return rej('Missing default value on ' + field.name);
                }
                if (isLocalizedObject(field.default)) {
                    // Old format: {en: ..., de: ...} — backwards compatible
                    field.default = detachDefault(field.default[client.locale] || field.default['en']);
                } else {
                    // New format: plain value — resolve locale from external file
                    field.default = resolveDefault(field);
                }
                if (typeof fieldValue === 'undefined') {
                    fieldValue = field.default;
                    return res(fieldValue);
                } else if (field.type === 'keyed' && field.disableKeyEdits) for (const key in field.default) if (fieldValue[key] == null) fieldValue[key] = field.default[key];
                if (field.allowNull && field.type !== 'boolean' && !fieldValue) return res(fieldValue);
                if (!await checkType(field, fieldValue)) {
                    if (isFetchBackedType(field)) {

                        /*
                         * checkType-false on a fetch-backed type is ambiguous: the ID may be gone OR a
                         * transient Discord failure rejected the fetch. Healing to the default here
                         * would permanently destroy a valid ID (or empty a valid array) on a blip.
                         */
                        if (!fieldValue && field.default === '') {

                            // A required fetch-backed field left unconfigured has an empty default that
                            // never validates; healing would re-fail every boot, so disable the module.
                            return rej(`Required field "${field.name}" in ${exampleFile.filename}${moduleName ? ` (module ${moduleName})` : ''} is not configured (empty default cannot be validated).`);
                        }
                        logger.warn(`[CONFIGURATION] Field "${field.name}" in ${exampleFile.filename}${moduleName ? ` (module ${moduleName})` : ''} could not be verified (stored value ${JSON.stringify(fieldValue)}); keeping the stored value without healing.`);
                        return res(fieldValue);
                    }

                    // Non-fetch types: an invalid stored value is definitively wrong, so heal to the
                    // default (persisted by the write-back below) instead of disabling the module.
                    if (client.scnxSetup) await require('./scnx-integration').reportIssue(client, {
                        type: 'CONFIGURATION_ISSUE',
                        module: moduleName,
                        field: field.name,
                        configFile: exampleFile.filename.replaceAll('.json', ''),
                        errorDescription: 'field_check_failed'
                    });
                    logger.warn(`[CONFIGURATION] Field "${field.name}" in ${exampleFile.filename}${moduleName ? ` (module ${moduleName})` : ''} had an invalid stored value (${JSON.stringify(fieldValue)}); healed to default (${JSON.stringify(field.default)}).`);
                    return res(field.default);
                }
                if (field.disableKeyEdits && field.type === 'keyed') {
                    for (const key in fieldValue) {
                        if (typeof field.default[key] === 'undefined') delete fieldValue[key];
                    }
                    for (const key in field.default) {
                        if (fieldValue[key] == null) fieldValue[key] = field.default[key];
                    }
                }
                if (client.scnxSetup) fieldValue = require('./scnx-integration').setFieldValue(client, field, fieldValue);
                res(fieldValue);
            });
        }

        if (forceOverwrite || (!skipOverwrite && !isEqual(configData, newConfig))) {
            if (!fs.existsSync(`${client.configDir}/${moduleName}`) && moduleName) fs.mkdirSync(`${client.configDir}/${moduleName}`);
            jsonfile.writeFileSync(`${client.configDir}${builtIn ? '' : '/' + moduleName}/${exampleFile.filename}`, newConfig, {spaces: 2});
            logger.info(localize('config', 'saved-file', {
                f: file,
                m: moduleName
            }));
        }
        if (!builtIn) client.configurations[moduleName][exampleFile.filename.split('.json').join('')] = newConfig;
        resolve();
    });
}

/**
 * Checks the build-in-configuration (not modules)
 * @private
 * @param {String} moduleName Name of the module to check
 * @param {FileName<String>} afterCheckEventFile File to execute after config got checked
 * @returns {Promise<unknown>}
 */
async function checkModuleConfig(moduleName, afterCheckEventFile = null) {
    return new Promise(async (resolve, reject) => {
            const moduleConf = require(`../../modules/${moduleName}/module.json`);
            if ((moduleConf['config-example-files'] || []).length === 0) return resolve();
            try {
                for (const v of moduleConf['config-example-files']) await checkConfigFile(v, moduleName);
                resolve();
            } catch (r) {
                reject(r);
            }
            if (afterCheckEventFile) require(`../../modules/${moduleName}/${afterCheckEventFile}`).afterCheckEvent(config);
        }
    );
}

module.exports.loadAllConfigs = loadAllConfigs;
module.exports.loadConfigLocalization = loadConfigLocalization;
module.exports.isLocalizedObject = isLocalizedObject;
module.exports.checkType = checkType;

/**
 * Check type of one field
 * @param {ConfigField<Object>} field Full field value
 * @param {String} value Value in the configuration file
 * @returns {Promise<boolean|*>}
 * @private
 */
async function checkType(field, value) {
    const {client} = require('../../main');
    switch (field.type) {
        case 'integer':
            if (parseInt(value) === 0) return true;
            if (field.maxValue && parseInt(value) > field.maxValue) return false;
            if (field.minValue && parseInt(value) < field.minValue) return false;
            return !!parseInt(value);
        case 'float':
            if (parseFloat(value) === 0) return true;
            if (field.maxValue && parseFloat(value) > field.maxValue) return false;
            if (field.minValue && parseFloat(value) < field.minValue) return false;
            return !!parseFloat(value);
        case 'string':
        case 'emoji':
        case 'imgURL':
        case 'timezone': // Timezones can not be checked correctly for their type currently.
            if (field.allowEmbed && typeof value === 'object') return true;
            return typeof value === 'string';
        case 'array':
            if (!Array.isArray(value)) return false;
            let errored = false;
            for (const v of value) {
                if (!errored) errored = !(await checkType({type: field.content}, v));
            }
            return !errored;
        case 'userID':
            const user = await client.users.fetch(value).catch(() => {
            });
            if (!user) {
                logger.error(localize('config', 'user-not-found', {id: value}));
                return false;
            }
            return true;
        case 'channelID':
            const channel = await client.channels.fetch(value).catch(() => {
            });
            if (!channel) {
                logger.error(localize('config', 'channel-not-found', {id: value}));
                return false;
            }
            if (channel.guild.id !== client.guildID) {
                logger.error(localize('config', 'channel-not-on-guild', {id: value}));
                return false;
            }
            const allowedTypes = (field.content || ['GUILD_TEXT', 'GUILD_CATEGORY', 'GUILD_NEWS', 'GUILD_VOICE', 'GUILD_STAGE_VOICE']).map(t => typeof t === 'string' ? (channelTypeMap[t] !== undefined ? channelTypeMap[t] : t) : t);
            if (!allowedTypes.includes(channel.type)) {
                logger.error(localize('config', 'channel-invalid-type', {id: value}));
                return false;
            }
            return true;
        case 'roleID':
            if (await (await client.guilds.fetch(client.guildID)).roles.fetch(value)) {
                return true;
            } else {
                logger.error(localize('config', 'role-not-found', {id: value}));
                return false;
            }
        case 'guildID':
            if (client.guilds.cache.find(g => g.id === client.guildID)) {
                return true;
            } else {
                logger.error(`Guild with ID "${value}" could not be found - have you invited the bot?`);
                return false;
            }
        case 'keyed':
            if (typeof value !== 'object') return false;
            let returnValue = true;
            for (const v in value) {
                if (returnValue) {
                    returnValue = await checkType({type: field.content.key}, v);
                    returnValue = await checkType({type: field.content.value}, value[v]);
                }
            }
            return returnValue;
        case 'select':
            return typeof field.content[0] !== 'string' ? field.content.find(f => f.value === value) : field.content.includes(value);
        case 'boolean':
            return typeof value === 'boolean';
        default:
            logger.error(`Unknown type: ${field.type}`);
            process.exit(pick(78)); // a config field declares an unknown type: invalid config, never restart
            ;
    }
}

/**
 * Check every (including module) configuration and load them
 * @param  {Client} client The client
 * @fires Client#configReload
 * @fires Client#botReady when loaded successfully
 * @since v2
 * @author Simon Csaba <mail@scderox.de>
 * @return {Promise}
 */
/**
 * Recompute the required gateway intents for the currently-enabled modules and diff against the live
 * client's active intents. Warns when a restart is needed to pick up newly-required intents. Pure read
 * of the on-disk config + client._activeIntents, so it can answer "does this need a restart?" up front.
 * @param {Client} client
 * @param {string} [modulesDir]
 * @param {boolean} [logWarnings=true]
 * @returns {{requiresRestart: boolean, missingIntents: string[]}}
 */
function computeReloadIntentChange(client, modulesDir, logWarnings = true) {
    const dir = modulesDir || path.join(__dirname, '..', '..', 'modules');
    const {
        names: required,
        unknown,
        allowedPrivileged,
        disabledModules,
        badAllowlistEntries
    } = computeRequiredIntents(client.configDir, dir);
    if (logWarnings && unknown.length) client.logger.warn(localize('config', 'intents-unknown', {intents: unknown.join(', ')}));
    if (logWarnings && badAllowlistEntries.length) client.logger.warn(localize('config', 'allowlist-bad-entries', {entries: badAllowlistEntries.join(', ')}));
    const missingIntents = diffIntents(client._activeIntents || [], required);
    const allowAll = allowedPrivileged.length === 0;

    /*
     * Still live on the connected gateway but no longer permitted by the on-disk allowlist. A live
     * intent cannot be dropped without a reconnect, so this needs a restart too — on which
     * applyIntentDisables will disable the modules that require it.
     */
    const removedIntents = (client._activeIntents || []).filter(i =>
        PRIVILEGED_INTENTS.includes(i) && !allowAll && !allowedPrivileged.includes(i));
    const requiresRestart = missingIntents.length > 0 || removedIntents.length > 0;
    if (logWarnings && missingIntents.length) {
        client.logger.warn(localize('config', 'intents-restart-required', {intents: missingIntents.join(', ')}));
    }
    if (logWarnings && removedIntents.length) {
        client.logger.warn(localize('config', 'intents-restart-required-removed', {
            intents: removedIntents.join(', '),
            modules: disabledModules.map(d => d.module).join(', ') || 'none'
        }));
    }
    return {
        requiresRestart,
        missingIntents,
        removedIntents
    };
}

module.exports.computeReloadIntentChange = computeReloadIntentChange;

module.exports.reloadConfig = async function (client) {
    client.logger.info(localize('config', 'config-reload'));
    if (client.scnxSetup) await require('./scnx-integration').beforeInit(client);
    client.botReadyAt = null;

    /**
     * Emitted when the configuration gets reloaded, used to disable intervals
     * @event Client#configReload
     */
    client.emit('configReload');

    for (const interval of client.intervals) {
        clearInterval(interval);
    }
    client.intervals = [];
    for (const job of client.jobs.filter(f => f !== null)) {
        job.cancel();
    }
    client.jobs = [];

    const moduleConf = jsonfile.readFileSync(`${client.configDir}/modules.json`);
    for (const moduleName in client.modules) {
        client.modules[moduleName].enabled = !!moduleConf[moduleName];
        client.modules[moduleName].userEnabled = !!moduleConf[moduleName];
    }

    const res = await loadAllConfigs(client);
    client.botReadyAt = new Date();

    if (client.scnxSetup) await require('./scnx-integration').init(client, true);

    /**
     * Emitted when the configuration got loaded successfully
     * @event Client#botReady
     */
    client.emit('botReady');

    if (client.scnxSetup) {
        client.config.customCommands = jsonfile.readFileSync(`${client.configDir}/custom-commands.json`);
        await require('./scnx-integration').verifyCustomCommands(client);
    }

    const intentChange = computeReloadIntentChange(client);
    res.requiresRestart = intentChange.requiresRestart;
    res.missingIntents = intentChange.missingIntents;

    return res;
};