const {asyncForEach} = require('./helpers');
const jsonfile = require('jsonfile');
const fs = require('fs');
const {logger} = require('../../main');

// Checking every (module AND bot) config file.
module.exports.checkAllConfigs = async function (client, moduleConf) {
    logger.info('Checking configs...');
    return new Promise(async resolve => {
        await fs.readdir(`${__dirname}/../../config-generator/`, async (err, files) => {
            await asyncForEach(files, async f => {
                await checkBuildInConfig(f);
            });
            await fs.readdir(`${__dirname}/../../modules/`, async (err, files) => {
                let needOverwrite = false;
                await asyncForEach(files, async f => {
                    if (moduleConf[f]) {
                        if (client.modules[f]['config']['on-checked-config-event']) await checkModuleConfig(f, require(`./modules/${f}/${client.modules[f]['config']['on-checked-config-event']}`));
                        else await checkModuleConfig(f);
                    } else if (typeof moduleConf[f] === 'undefined') needOverwrite = true;
                });
                if (needOverwrite) await generateModulesConfOverwrite(moduleConf, files);
                logger.info('Done with checking.');
                resolve();
            });
        });
    });
}

function checkModuleConfig (moduleName, afterCheckEventFile = null) {
    return new Promise(resolve => {
        const {client} = require('../../main');
        const moduleConf = require(`../../modules/${moduleName}/module.json`);
        if (!moduleConf['config-example-files']) return resolve();
        moduleConf['config-example-files'].forEach(v => {
            let exampleFile;
            try {
                exampleFile = require(`../../modules/${moduleName}/${v}`);
            } catch (e) {
                logger.error(`Not found config example file: ${moduleName}/${v}`);
                process.exit(1);
            }
            if (!exampleFile) return;
            let config = exampleFile.configElements ? [] : {};
            let ow = false;
            try {
                config = require(`${client.configDir}/${moduleName}/${exampleFile.filename}`);
            } catch (e) {
                logger.info(`Config ${moduleName}/${exampleFile.filename} does not exist - I'm going to create it - stand by...`);
                ow = true;
            }
            if (exampleFile.configElements) {
                exampleFile.content.forEach(async field => {
                    asyncForEach(config, async (element) => {
                        config = await checkField(field, element);
                    });
                });
            } else {
                exampleFile.content.forEach(async field => {
                    config = await checkField(field, config);
                });
            }

            async function checkField(field, configElement) {
                if (!field.field_name) return;
                if (typeof configElement[field.field_name] === 'undefined') return configElement[field.field_name] = field.default;
                if (!await checkType(field.type, configElement[field.field_name], field.content, field.allowEmbed)) {
                    logger.error(`An error occurred while checking the content of field ${field.field_name} in ${moduleName}/${exampleFile.filename}`);
                    process.exit(1); // ToDo Only disable plugin not stop bot
                }
                if (field.disableKeyEdits) {
                    for (const content in configElement[field.field_name]) {
                        if (!field.default[content]) {
                            logger.error(`Error with ${content} in ${field.field_name} in ${moduleName}/${exampleFile.filename}: Unexpected index ${content}`);
                            process.exit(1); // ToDo Only disable plugin not stop bot
                        }
                    }
                }
                return configElement;
            }

            if (ow) {
                if (!fs.existsSync(`${client.configDir}/${moduleName}`)) fs.mkdirSync(`${client.configDir}/${moduleName}`)
                jsonfile.writeFileSync(`${client.configDir}/${moduleName}/${exampleFile.filename}`, config, {spaces: 2}, (err=> {
                    if (err) {
                        logger.error(`An error occurred while saving ${moduleName}/${exampleFile.filename}: ${err}`);
                    } else {
                        logger.info(`[MODULE: ${moduleName}]: Config ${v} was saved successfully successfully.`);
                    }
                    resolve();
                }))
            } else {
                resolve();
            }
            client.configurations[moduleName][exampleFile.filename.split('.json').join('')] = config;
        });
        if (afterCheckEventFile) require(`../../modules/${moduleName}/${afterCheckEventFile}`).afterCheckEvent(config);
    });
};

async function checkBuildInConfig (configName) {
    return new Promise(resolve => {
        const {client} = require('../../main');
        const exampleFile = require(`../../config-generator/${configName}`);
        if (!exampleFile) return;
        let config = {};
        let ow = false;
        try {
            config = require(`${client.configDir}/${configName}`);
        } catch (e) {
            logger.log(`Config config/${configName} does not exist - I'm going to create it - stand by...`);
            ow = true;
        }
        exampleFile.content.forEach(async field => {
            if (!field.field_name) return;
            if (!config[field.field_name]) return config[field.field_name] = field.default;
            if (!await checkType(field.type, config[field.field_name], field.content, field.allowEmbed)) {
                logger.error(`An error occurred while checking the content of field ${field.field_name} in config/${configName}`);
                process.exit(1);
            }
            if (field.disableKeyEdits) {
                for (const content in config[field.field_name]) {
                    if (!field.default[content]) {
                        logger.error(`Error with ${content} in ${field.field_name} in config/${configName}: Unexpected index ${content}`);
                        process.exit(1);
                    }
                }
            }
        });
        if (ow) {
            jsonfile.writeFile(`${client.configDir}/${configName}`, config, {spaces: 2}, (err => {
                if (err) {
                    logger.error(`An error occurred while saving config/${configName}: ${err}`);
                } else {
                    logger.info(`[CONFIG: ${configName}]: Config ${configName} was saved successfully successfully.`);
                }
                resolve();
            }))
        } else {
            resolve();
        }
    });
}

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
    }) )
}

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
            let errored = true;
            await asyncForEach(value, function (v) {
                if (errored) errored = checkType(contentFormat, v, null, allowEmbed);
            });
            return errored;
        case 'channelID':
            const channel = await client.channels.fetch(value).catch(() => {});
            if (!channel) {
                logger.error(`Channel with ID "${value}" not found.`)
                return false;
            }
            if (channel.guild.id !== client.guildID) {
                logger.error(`Channel with ID "${value}" is not on the guild specified in your configuration file.`)
                return false;
            }
            return true;
        case 'roleID':
            if (await (await client.guilds.fetch(client.guildID)).roles.fetch(value)) {
                return true;
            } else {
                logger.error(`Role with ID "${value}" could not be found.`)
                return false;
            }
        case 'guildID':
            if (client.guilds.cache.find(g => g.id === client.guildID)) {
                return true;
            } else {
                logger.error(`Guild with ID "${value}" could not be found - have you invited the bot?`)
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
            console.error(`Unknown type: ${type}`);
            process.exit(1);
    }
}

module.exports.reloadConfig = async function() {

}