const fse = require('fs-extra');
const {asyncForEach} = require('./helpers');
const beautify = require('json-beautify');

module.exports.checkModuleConfig = function (moduleName, afterCheckEventFile = null) {
    return new Promise(resolve => {
        const {client} = require('../../main');
        const moduleConf = require(`../../modules/${moduleName}/module.json`);
        if (!moduleConf['config-example-files']) return resolve();
        moduleConf['config-example-files'].forEach(v => {
            let exampleFile;
            try {
                exampleFile = require(`../../modules/${moduleName}/${v}`);
            } catch (e) {
                console.error(`[ERROR] Not found config example file: ${moduleName}/${v}`);
                process.exit(1);
            }
            if (!exampleFile) return;
            let config = {};
            let ow = false;
            try {
                config = require(`${client.configDir}/${moduleName}/${exampleFile.filename}`);
            } catch (e) {
                console.log(`[INFO] Config ${moduleName}/${exampleFile.filename} does not exist - I'm going to create it - stand by...`);
                ow = true;
            }
            exampleFile.content.forEach(async field => {
                if (!field.field_name) return;
                if (typeof config[field.field_name] === 'undefined') return config[field.field_name] = field.default;
                if (!await checkType(field.type, config[field.field_name], field.content, field.allowEmbed)) {
                    console.error(`[ERROR] An error occurred while checking the content of field ${field.field_name} in ${moduleName}/${exampleFile.filename}`);
                    process.exit(1); // ToDo Only disable plugin not stop bot
                }
                if (field.disableKeyEdits) {
                    for (const content in config[field.field_name]) {
                        if (!field.default[content]) {
                            console.error(`[ERROR] Error with ${content} in ${field.field_name} in ${moduleName}/${exampleFile.filename}: Unexpected index ${content}`);
                            process.exit(1); // ToDo Only disable plugin not stop bot
                        }
                    }
                }
            });
            if (afterCheckEventFile) require(`../../modules/${moduleName}/${afterCheckEventFile}`).afterCheckEvent(config);

            if (ow) {
                fse.outputFile(`${client.configDir}/${moduleName}/${exampleFile.filename}`, beautify(config, null, 2, 100), (err => {
                    if (err) {
                        console.error(`[ERROR] An error occurred while saving ${moduleName}/${exampleFile.filename}: ${err}`);
                    } else {
                        console.log(`[MODULE: ${moduleName}]: Config ${v} was saved successfully successfully.`);
                    }
                    resolve();
                }));
            } else {
                resolve();
            }
        });
    });
};

module.exports.checkBuildInConfig = async function (configName) {
    return new Promise(resolve => {
        const {client} = require('../../main');
        const exampleFile = require(`../../config-generator/${configName}`);
        if (!exampleFile) return;
        let config = {};
        let ow = false;
        try {
            config = require(`${client.configDir}/${configName}`);
        } catch (e) {
            console.log(`[INFO] Config config/${configName} does not exist - I'm going to create it - stand by...`);
            ow = true;
        }
        exampleFile.content.forEach(async field => {
            if (!field.field_name) return;
            if (!config[field.field_name]) return config[field.field_name] = field.default;
            if (!await checkType(field.type, config[field.field_name], field.content, field.allowEmbed)) {
                console.error(`[ERROR] An error occurred while checking the content of field ${field.field_name} in config/${configName}`);
                process.exit(1);
            }
            if (field.disableKeyEdits) {
                for (const content in config[field.field_name]) {
                    if (!field.default[content]) {
                        console.error(`[ERROR] Error with ${content} in ${field.field_name} in config/${configName}: Unexpected index ${content}`);
                        process.exit(1);
                    }
                }
            }
        });
        if (ow) {
            fse.outputFile(`${client.configDir}/${configName}`, beautify(config, null, 2, 100), (err => {
                if (err) {
                    console.error(`[ERROR] An error occurred while saving config/${configName}: ${err}`);
                } else {
                    console.log(`[CONFIG: ${configName}]: Config ${configName} was saved successfully successfully.`);
                }
                resolve();
            }));
        } else {
            resolve();
        }
    });
};

module.exports.generateModulesConfOverwrite = async function (moduleConf, modules) {
    const {client} = require('../../main');
    console.log('[INFO] Regenerating modules.json. Do not worry, we will not overwrite settings (;');
    await asyncForEach(modules, module => {
        if (typeof moduleConf[module] === 'undefined') moduleConf[module] = false;
    });
    fse.outputFile(`${client.configDir}/modules.json`, beautify(moduleConf, null, 2, 100), (err => {
        if (err) {
            console.error(`[ERROR] An error occurred while saving modules.json: ${err}`);
        } else {
            console.log('[INFO] Saved modules.json successfully');
        }
    }));
};

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
            return true;
        /*
            RETURNING TRUE HERE BECAUSE SOMETIMES THIS FAILS RANDOMLY. WILL RETURN TO THIS LATER
        const guild = (await client.guilds.fetch(client.guildID)).channels;
            if (await guild.cache.get(value)) {
                return true;
            } else {
                console.error(`[ERROR] Channel with ID ${value} in Guild-ID ${client.guildID} could not be found`);
                return false;
            }*/
        case 'roleID':
            if (await (await client.guilds.fetch(client.guildID)).roles.fetch(value)) {
                return true;
            } else {
                console.error(`[ERROR] Role with ID ${value} in Guild-ID ${client.guildID} could not be found`);
                return false;
            }
        case 'guildID':
            if (client.guilds.cache.find(g => g.id === client.guildID)) {
                return true;
            } else {
                console.error(`[ERROR] Guild with ID ${value} could not be found`);
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
            return contentFormat.includes(value)
        case 'boolean':
            return typeof value === 'boolean';
        default:
            console.error(`Unknown type: ${type}`);
            process.exit(1);
    }
}