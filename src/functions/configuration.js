/**
 * Handels configuration loading and reloading
 * @module Configuration
 * @author Simon Csaba <mail@scderox.de>
 */
const jsonfile = require('jsonfile');
const fs = require('fs');
const {logger} = require('../../main');
const {localize} = require('./localize');

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
        await fs.readdir(`${__dirname}/../../config-generator/`, async (err, files) => {
            for (const f of files) {
                await checkBuildInConfig(f).catch((reason) => reject(reason));
            }

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
        const {client} = require('../../main');
        const moduleConf = require(`../../modules/${moduleName}/module.json`);
        if (!moduleConf['config-example-files']) return resolve();
        for (const v of moduleConf['config-example-files']) {
            let exampleFile;
            try {
                exampleFile = require(`../../modules/${moduleName}/${v}`);
            } catch (e) {
                logger.error(`Not found config example file: ${moduleName}/${v}`);
                return reject(`Not found config example file: ${moduleName}/${v}`);
            }
            if (!exampleFile) return;
            let config = exampleFile.configElements ? [] : {};
            let ow = false;
            try {
                config = jsonfile.readFileSync(`${client.configDir}/${moduleName}/${exampleFile.filename}`);
            } catch (e) {
                logger.info(localize('config', 'creating-file', {
                    m: moduleName,
                    f: exampleFile.filename
                }));
                ow = true;
            }
            if (exampleFile.configElements) {
                if (!Array.isArray(config)) {
                    client.logger.warn('Called f 239B (with addition: trying to automatically migrate) as work-around for wrong configuration'); // idk what the fuck this is, so i just added some random stuff to it
                    if (typeof config === 'object') config = [config];
                    else config = [];
                }
                for (const field of exampleFile.content) {
                    if (client.locale) {
                        if (field[`default-${client.locale}`]) field.default = field[`default-${client.locale}`];
                        else if (field[`default-en`]) field.default = field[`default-en`];
                    }
                    for (const i in config) {
                        try {
                            config[i] = await checkField(field, config[i]);
                        } catch (e) {
                            return reject(e);
                        }
                    }
                }
            } else {
                for (const field of exampleFile.content) {
                    if (client.locale) {
                        if (field[`default-${client.locale}`]) field.default = field[`default-${client.locale}`];
                        else if (field[`default-en`]) field.default = field[`default-en`];
                    }
                    try {
                        config = await checkField(field, config);
                    } catch (e) {
                        return reject(e);
                    }
                }
            }

            /**
             * Checks the content of a field
             * @param {Field<Object>} field Field-Object
             * @param {*[]} configElement Current config element
             * @returns {Promise<void|*>}
             */
            function checkField(field, configElement) {
                return new Promise(async (res, rej) => {
                    if (!field.field_name) return rej('missing fieldname.');
                    if (client.locale) {
                        if (field[`default-${client.locale}`]) field.default = field[`default-${client.locale}`];
                        else if (field[`default-en`]) field.default = field[`default-en`];
                    }
                    if (typeof configElement[field.field_name] === 'undefined') {
                        configElement[field.field_name] = field.default;
                        return res(configElement);
                    } else if (field.type === 'keyed' && field.disableKeyEdits) {
                        for (const key in field.default) {
                            if (!configElement[field.field_name][key]) {
                                ow = true;
                                configElement[field.field_name][key] = field.default[key];
                            }
                        }
                    }
                    if (field.allowNull && (configElement[field.field_name] || '').toString().replaceAll(' ', '') === '' || typeof configElement[field.field_name] === 'undefined') return res(configElement);
                    if (!await checkType(field.type, configElement[field.field_name], field.content, field.allowEmbed)) {
                        if (client.scnxSetup) await require('./scnx-integration').reportIssue(client, {
                            type: 'CONFIGURATION_ISSUE',
                            module: moduleName,
                            field: field.field_name,
                            configFile: exampleFile.filename.replaceAll('.json', ''),
                            errorDescription: 'field_check_failed'
                        });
                        logger.error(localize('config', 'checking-of-field-failed', {
                            fieldName: field.field_name,
                            m: moduleName,
                            f: exampleFile.filename
                        }));
                        rej(localize('config', 'checking-of-field-failed', {
                            fieldName: field.field_name,
                            m: moduleName,
                            f: exampleFile.filename
                        }));
                    }
                    if (field.disableKeyEdits) {
                        for (const content in configElement[field.field_name]) {
                            if (!field.default[content]) {
                                delete configElement[field.field_name][content];
                                ow = true;
                            }
                        }
                    }
                    if (client.scnxSetup) configElement[field.field_name] = require('./scnx-integration').setFieldValue(client, field, configElement[field.field_name]);
                    res(configElement);
                });
            }

            if (ow) {
                if (!fs.existsSync(`${client.configDir}/${moduleName}`)) fs.mkdirSync(`${client.configDir}/${moduleName}`);
                jsonfile.writeFileSync(`${client.configDir}/${moduleName}/${exampleFile.filename}`, config, {spaces: 2});
                logger.info(localize('config', 'saved-file', {
                    f: v,
                    m: moduleName
                }));
            }
            client.configurations[moduleName][exampleFile.filename.split('.json').join('')] = config;
        }
        resolve();
        if (afterCheckEventFile) require(`../../modules/${moduleName}/${afterCheckEventFile}`).afterCheckEvent(config);
    }
    );
}

/**
 * Checks the build-in-configuration (not modules)
 * @private
 * @param {String} configName Name of the configuration to check
 * @returns {Promise<unknown>}
 */
async function checkBuildInConfig(configName) {
    return new Promise(async (resolve, reject) => {
        const {client} = require('../../main');
        const exampleFile = require(`../../config-generator/${configName}`);
        if (!exampleFile) return;
        let config = {};
        let ow = false;
        try {
            config = jsonfile.readFileSync(`${client.configDir}/${configName}`);
        } catch (e) {
            logger.log(localize('config', 'creating-file', {
                m: 'config',
                f: configName
            }));
            ow = true;
        }
        if (!exampleFile.skipContentCheck) for (const field of exampleFile.content) {
            if (!field.field_name) return reject(`One field is missing a name. Please check your config generation files`);
            if (client.locale) {
                if (field[`default-${client.locale}`]) field.default = field[`default-${client.locale}`];
                else if (field[`default-en`]) field.default = field[`default-en`];
            }
            if (!config[field.field_name]) {
                config[field.field_name] = field.default;
                continue;
            }
            if (!await checkType(field.type, config[field.field_name], field.content, field.allowEmbed)) {
                if (client.scnxSetup) await require('./scnx-integration').reportIssue(client, {
                    type: 'CONFIGURATION_ISSUE',
                    field: field.field_name,
                    configFile: exampleFile.filename.replaceAll('.json', ''),
                    errorDescription: 'field_check_failed'
                });
                logger.error(localize('config', 'checking-of-field-failed', {
                    fieldName: field.field_name,
                    m: 'config',
                    f: exampleFile.filename
                }));
                return reject(localize('config', 'checking-of-field-failed', {
                    fieldName: field.field_name,
                    m: 'config',
                    f: exampleFile.filename
                }));
            }
            if (field.disableKeyEdits) {
                for (const content in config[field.field_name]) {
                    if (!field.default[content]) {
                        delete config[field.field_name][content];
                        ow = true;
                        logger.warn(`Error with ${content} in ${field.field_name} in config/${configName}: Unexpected index ${content}. Auto-Fix attempt succeeded`);
                    }
                }
            }
        }
        else if (ow) config = exampleFile.default;
        if (ow) {
            jsonfile.writeFile(`${client.configDir}/${configName}`, config, {spaces: 2}, (err => {
                if (err) {
                    logger.error(`An error occurred while saving config/${configName}: ${err}`);
                } else {
                    logger.info(localize('config', 'saved-file', {
                        f: configName,
                        m: 'config'
                    }));
                }
                resolve();
            }));
        } else {
            resolve();
        }
    });
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
            return !!parseInt(value);
        case 'string':
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
            if (!(contentFormat || ['GUILD_TEXT', 'GUILD_CATEGORY', 'GUILD_NEWS', 'GUILD_STAGE_VOICE']).includes(channel.type)) {
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
    for (const job of client.jobs) {
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

    if (client.scnxSetup) client.config.customCommands = jsonfile.readFileSync(`${client.configDir}/custom-commands.json`);

    return res;
};