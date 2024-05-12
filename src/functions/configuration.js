/**
 * Handels configuration loading and reloading
 * @module Configuration
 * @author Simon Csaba <mail@scderox.de>
 */
const jsonfile = require('jsonfile');
const fs = require('fs');
const {logger, client} = require('../../main');
const {localize} = require('./localize');
const isEqual = require('is-equal');

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
        await fs.readdir(`${__dirname}/../../config-generator`, async (err, files) => {
            for (const f of files) {
                await checkConfigFile(f).catch((reason) => {
                    logger.error(reason);
                    reject(reason);
                });
            }
        });

        for (const moduleName in client.modules) {
            if (!client.modules[moduleName].userEnabled) continue;
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
        if (exampleFile.elementLimits) configData = require('./scnx-integration').verifyLimitedConfigElementFile(client, exampleFile, configData);

        let skipOverwrite = false;
        if (exampleFile.skipContentCheck) newConfig = configData;
        else if (exampleFile.configElements) {
            if (!Array.isArray(configData)) {
                client.logger.warn(`${builtIn ? '' : '/' + moduleName}/${exampleFile.filename}: This file should be a config-element, but is not. Converting to config-element.`);
                if (typeof configData === 'object') configData = [configData];
                else configData = [];
            }
            for (const object of configData) {
                const objectData = {};
                for (const field of exampleFile.content) {
                    const dependsOnField = field.dependsOn ? exampleFile.content.find(f => f.name === field.dependsOn) : null;
                    if (field.dependsOn && !dependsOnField) return reject(`Depends-On-Field ${field.dependsOn} does not exist.`);
                    if (dependsOnField && !(typeof object[dependsOnField.name] === 'undefined' ? (dependsOnField.default[client.locale] || dependsOnField.default['en']) : object[dependsOnField.name])) {
                        objectData[field.name] = configData[field.name] || (field.default[client.locale] || field.default['en']); // Otherwise disabled fields may be overwritten
                        continue;
                    }
                    try {
                        objectData[field.name] = await checkField(field, object[field.name]);
                    } catch (e) {
                        return reject(e);
                    }
                }
                newConfig.push(objectData);
            }
        } else {
            for (const field of exampleFile.content) {
                if (exampleFile.content.find(f => f.elementToggle) && !configData[exampleFile.content.find(f => f.elementToggle).name]) {
                    skipOverwrite = true;
                    continue;
                }
                const dependsOnField = field.dependsOn ? exampleFile.content.find(f => f.name === field.dependsOn) : null;
                if (field.dependsOn && !dependsOnField) return reject(`Depends-On-Field ${field.dependsOn} does not exist.`);
                if (dependsOnField && !(typeof configData[dependsOnField.name] === 'undefined' ? (dependsOnField.default[client.locale] || dependsOnField.default['en']) : configData[dependsOnField.name])) {
                    newConfig[field.name] = configData[field.name] || (field.default[client.locale] || field.default['en']); // Otherwise disabled fields may be overwritten
                    continue;
                }
                try {
                    newConfig[field.name] = await checkField(field, configData[field.name]);
                } catch (e) {
                    return reject(e);
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
                if (typeof field.default === 'undefined' || typeof field.default.en === 'undefined') {
                    console.log(field.default);
                    return rej('Missing default value on ' + field.name);
                }
                if (typeof field.default !== 'object') return rej(`${field.name} has an invalid default value. The default value needs to be localized. A possible fix could be: default = "${JSON.stringify({en: field.default})}". If you want a default value for all languages, only set the "en" key.`);
                field.default = field.default[client.locale] || field.default['en'];
                if (typeof fieldValue === 'undefined') {
                    fieldValue = field.default;
                    return res(fieldValue);
                } else if (field.type === 'keyed' && field.disableKeyEdits) for (const key in field.default) if (typeof fieldValue[key] === 'undefined') fieldValue[key] = field.default[key];
                if (field.allowNull && field.type !== 'boolean' && !fieldValue) return res(fieldValue);
                if (!await checkType(field.type, fieldValue, field.content, field.allowEmbed)) {
                    if (client.scnxSetup) await require('./scnx-integration').reportIssue(client, {
                        type: 'CONFIGURATION_ISSUE',
                        module: moduleName,
                        field: field.name,
                        configFile: exampleFile.filename.replaceAll('.json', ''),
                        errorDescription: 'field_check_failed'
                    });
                    logger.error(localize('config', 'checking-of-field-failed', {
                        fieldName: field.name,
                        m: moduleName,
                        f: exampleFile.filename
                    }));
                    rej(localize('config', 'checking-of-field-failed', {
                        fieldName: field.name,
                        m: moduleName,
                        f: exampleFile.filename
                    }));
                }
                if (field.disableKeyEdits && field.type === 'keyed') {
                    for (const key in fieldValue) {
                        if (typeof field.default[key] === 'undefined') delete fieldValue[key];
                    }
                    for (const key in field.default) {
                        if (typeof fieldValue[key] === 'undefined') fieldValue[key] = field.default[key];
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

/**
 * Check type of one field
 * @param {FieldType<String>} type Type of the field
 * @param {String} value Value in the configuration file
 * @param {ConfigFormat<Object>} contentFormat Format of the content
 * @param {Boolean} allowEmbed If embeds are allowed
 * @returns {Promise<boolean|*>}
 * @private
 */
async function checkType(type, value, contentFormat = null, allowEmbed = false) {
    const {client} = require('../../main');
    switch (type) {
        case 'integer':
            if (parseInt(value) === 0) return true;
            return !!parseInt(value);
        case 'float':
            if (parseFloat(value) === 0) return true;
            return !!parseFloat(value);
        case 'string':
        case 'emoji':
        case 'imgURL':
        case 'timezone': // Timezones can not be checked correctly for their type currently.
            if (allowEmbed && typeof value === 'object') return true;
            return typeof value === 'string';
        case 'array':
            if (!Array.isArray(value)) return false;
            let errored = false;
            for (const v of value) {
                if (!errored) errored = !(await checkType(contentFormat, v, null, allowEmbed));
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
            if (!(contentFormat || ['GUILD_TEXT', 'GUILD_CATEGORY', 'GUILD_NEWS', 'GUILD_VOICE', 'GUILD_STAGE_VOICE']).includes(channel.type)) {
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
                    returnValue = await checkType(contentFormat.key, v);
                    returnValue = await checkType(contentFormat.value, value[v]);
                }
            }
            return returnValue;
        case 'select':
            return contentFormat.includes(value);
        case 'boolean':
            return typeof value === 'boolean';
        default:
            logger.error(`Unknown type: ${type}`);
            process.exit(1);
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

    // Reload module configuration
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

    return res;
};