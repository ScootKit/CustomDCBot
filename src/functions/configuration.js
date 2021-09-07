/**
 * Handels configuration loading and reloading
 * @module Configuration
 * @author Simon Csaba <mail@scderox.de>
 */
const {asyncForEach} = require('./helpers');
const jsonfile = require('jsonfile');
const fs = require('fs');
const {logger} = require('../../main');

/**
 * Check every (including module) configuration and load them
 * @author Simon Csaba <mail@scderox.de>
 * @param  {Client} client The client
 * @param  {Object} moduleConf Configuration of modules.json
 * @return {Promise}
 */
async function loadAllConfigs(client, moduleConf) {
    logger.info('Checking configs...');
    return new Promise(async (resolve, reject) => {
        await fs.readdir(`${__dirname}/../../config-generator/`, async (err, files) => {
            await asyncForEach(files, async f => {
                await checkBuildInConfig(f).catch((reason) => reject(reason));
            });
            await fs.readdir(`${__dirname}/../../modules/`, async (err, moduleFiles) => {
                let needOverwrite = false;
                await asyncForEach(moduleFiles, async f => {
                    if (moduleConf[f]) {
                        if (client.modules[f]['config']['on-checked-config-event']) await checkModuleConfig(f, require(`./modules/${f}/${client.modules[f]['config']['on-checked-config-event']}`));
                        else await checkModuleConfig(f).catch((reason) => {
                            reject(reason);
                        });
                    } else if (typeof moduleConf[f] === 'undefined') needOverwrite = true;
                });
                if (needOverwrite) await generateModulesConfOverwrite(moduleConf, moduleFiles);
                logger.info('Done with checking.');
                resolve();
            });
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
                logger.info(`Config ${moduleName}/${exampleFile.filename} does not exist - I'm going to create it - stand by...`);
                ow = true;
            }
            if (exampleFile.configElements) {
                for (const field of exampleFile.content) {
                    for (const element of config) {
                        await checkField(field, element);
                    }
                }
            } else {
                for (const field of exampleFile.content) {
                    await checkField(field, config);
                }
            }

            /**
             * Checks the content of a field
             * @param {Field<Object>} field Field-Object
             * @param {configElement<Object>} configElement Current config element
             * @returns {Promise<void|*>}
             */
            async function checkField(field, configElement) {
                if (!field.field_name) return;
                if (typeof configElement[field.field_name] === 'undefined') return configElement[field.field_name] = field.default;
                if (!await checkType(field.type, configElement[field.field_name], field.content, field.allowEmbed)) {
                    logger.error(`An error occurred while checking the content of field ${field.field_name} in ${moduleName}/${exampleFile.filename}`);
                    return reject(`An error occurred while checking the content of field ${field.field_name} in ${moduleName}/${exampleFile.filename}`);
                }
                if (field.disableKeyEdits) {
                    for (const content in configElement[field.field_name]) {
                        if (!field.default[content]) {
                            logger.error(`Error with ${content} in ${field.field_name} in ${moduleName}/${exampleFile.filename}: Unexpected index ${content}`);
                            return reject(`Error with ${content} in ${field.field_name} in ${moduleName}/${exampleFile.filename}: Unexpected index ${content}`);
                        }
                    }
                }
                return configElement;
            }

            if (ow) {
                if (!fs.existsSync(`${client.configDir}/${moduleName}`)) fs.mkdirSync(`${client.configDir}/${moduleName}`);
                jsonfile.writeFileSync(`${client.configDir}/${moduleName}/${exampleFile.filename}`, config, {spaces: 2});
                logger.info(`[MODULE: ${moduleName}]: Config ${v} was saved successfully successfully.`);
                resolve();
            } else {
                resolve();
            }
            client.configurations[moduleName][exampleFile.filename.split('.json').join('')] = config;
        }
        if (afterCheckEventFile) require(`../../modules/${moduleName}/${afterCheckEventFile}`).afterCheckEvent(config);
    });
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
            logger.log(`Config config/${configName} does not exist - I'm going to create it - stand by...`);
            ow = true;
        }
        for (const field of exampleFile.content) {
            if (!field.field_name) return reject(`One field is missing a name. Please check your config generation files`);
            if (!config[field.field_name]) {
                config[field.field_name] = field.default;
                continue;
            }
            if (!await checkType(field.type, config[field.field_name], field.content, field.allowEmbed)) {
                logger.error(`An error occurred while checking the content of field ${field.field_name} in config/${configName}`);
                return reject(`An error occurred while checking the content of field ${field.field_name} in ${exampleFile.filename}`);
            }
            if (field.disableKeyEdits) {
                for (const content in config[field.field_name]) {
                    if (!field.default[content]) {
                        logger.error(`Error with ${content} in ${field.field_name} in config/${configName}: Unexpected index ${content}`);
                        return reject(`An error occurred while checking the content of field ${field.field_name} in ${exampleFile.filename}`);
                    }
                }
            }
        }
        if (ow) {
            jsonfile.writeFile(`${client.configDir}/${configName}`, config, {spaces: 2}, (err => {
                if (err) {
                    logger.error(`An error occurred while saving config/${configName}: ${err}`);
                } else {
                    logger.info(`[CONFIG: ${configName}]: Config ${configName} was saved successfully successfully.`);
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
 * Generates module.json overwrite
 * @param {Object} moduleConf Current module configuration
 * @param {Array} modules Array of all availible modules
 * @returns {Promise<void>}
 * @private
 */
async function generateModulesConfOverwrite(moduleConf, modules) {
    const {client} = require('../../main');
    logger.info('Regenerating modules.json. Do not worry, we will not overwrite settings (;');
    await asyncForEach(modules, module => {
        if (typeof moduleConf[module] === 'undefined') moduleConf[module] = false;
    });
    jsonfile.writeFileSync(`${client.configDir}/modules.json`, moduleConf, {spaces: 2}, (err => {
        if (err) {
            logger.error(`An error occurred while saving modules.json: ${err}`);
        } else {
            logger.info('Saved modules.json successfully');
        }
    }));
}

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
            if (allowEmbed && typeof value === 'object') return true;
            return typeof value === 'string';
        case 'array':
            if (typeof value !== 'object') return false;
            let errored = false;
            await asyncForEach(value, async function (v) {
                if (!errored) errored = !(await checkType(contentFormat, v, null, allowEmbed));
            });
            return !errored;
        case 'channelID':
            const channel = await client.channels.fetch(value).catch(() => {
            });
            if (!channel) {
                logger.error(`Channel with ID "${value}" not found.`);
                return false;
            }
            if (channel.guild.id !== client.guildID) {
                logger.error(`Channel with ID "${value}" is not on the guild specified in your configuration file.`);
                return false;
            }
            return true;
        case 'roleID':
            if (await (await client.guilds.fetch(client.guildID)).roles.fetch(value)) {
                return true;
            } else {
                logger.error(`Role with ID "${value}" could not be found.`);
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
    client.logger.info('Reloading all configurations...');
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

    await loadAllConfigs(client, client.moduleConf);
    client.botReadyAt = new Date();

    /**
     * Emitted when the configuration got loaded successfully
     * @event Client#botReady
     */
    client.emit('botReady');

    client.logger.info('Configuration reloaded successfully');
};