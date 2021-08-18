const Discord = require('discord.js');
const client = new Discord.Client({partials: ['MESSAGE', 'CHANNEL', 'REACTION'], disableMentions: 'everyone'});
const fs = require('fs');
const {Sequelize} = require('sequelize');
const {asyncForEach} = require('./src/functions/helpers');

// Parsing parameters
let config;
let confDir = `${__dirname}/config`;
let dataDir = `${__dirname}/data`;
const args = process.argv.slice(2);
let scnxSetup = false; // If enabled some other (closed-sourced) files get imported and executed
if (process.argv.includes('--scnx-enabled')) scnxSetup = true;
if (args[0] === '--help' || args[0] === '-h') {
    console.log('node main.js <configDir> <dataDir>');
    process.exit();
}
if (args[0] && args[1]) {
    confDir = args[0];
    dataDir = args[1];
}
// Loading config
try {
    config = require(`${confDir}/config.json`);
} catch (e) {
    console.error('[FATAL] Missing config.json! Run "npm run generate-config <ConfDir>" (Parameter ConfDir is optional) to generate it');
    process.exit(1);
}
let moduleConf = {};
try {
    moduleConf = require(`${confDir}/modules.json`);
} catch (e) {
    console.log('[INFO] Missing moduleConfig-file. Automatically disabling all modules and overwriting modules.json later');
}

const configChecker = require('./src/functions/checkConfig');

const models = {}; // Object with all models

client.commands = new Discord.Collection();
client.aliases = new Discord.Collection();
client.events = new Discord.Collection();
client.modules = {};
client.guildID = config['guildID'];
client.config = config;
client.configDir = confDir;
client.dataDir = dataDir;

// Connecting to Database
const db = new Sequelize({
    dialect: 'sqlite',
    storage: `${dataDir}/database.sqlite`,
    logging: false
});

// Starting bot
db.authenticate().then(async () => {
    await loadModules();
    await loadCommandsInDir('./src/commands');
    await loadEventsInDir('./src/events');
    await db.sync();
    console.log('[DB] Synced db');
    await client.login(config.token).catch(console.error);
    console.log(`[BOT] Client logged in as ${client.user.tag} and is now online!`);
    client.models = models;
    await checkAllConfigs();
    client.strings = require(`${confDir}/strings.json`);
    if (scnxSetup) await require('./src/functions/scnx-integration').init(client);
    client.emit('botReady');
    client.botReadyAt = new Date();
    console.log('[BOT] The bot initiated successfully and is now listening to commands.');
});

// Checking every (module AND bot) config file.
async function checkAllConfigs() {
    console.log('[INFO] Checking configs...');
    return new Promise(async resolve => {
        await fs.readdir(`${__dirname}/config-generator/`, async (err, files) => {
            await asyncForEach(files, async f => {
                await configChecker.checkBuildInConfig(f);
            });
            await fs.readdir(`${__dirname}/modules/`, async (err, moduleFiles) => {
                let needOverwrite = false;
                await asyncForEach(moduleFiles, async f => {
                    if (moduleConf[f]) {
                        if (client.modules[f]['config']['on-checked-config-event']) await configChecker.checkModuleConfig(f, require(`./modules/${f}/${client.modules[f]['config']['on-checked-config-event']}`));
                        else await configChecker.checkModuleConfig(f);
                    } else if (typeof moduleConf[f] === 'undefined') needOverwrite = true;
                });
                if (needOverwrite) await configChecker.generateModulesConfOverwrite(moduleConf, moduleFiles);
                console.log('[INFO] Done with checking.');
                resolve();
            });
        });
    });
}

// Load all modules
async function loadModules() {
    const files = fs.readdirSync(`${__dirname}/modules/`);
    for (const f of files) {
        if (moduleConf[f]) {
            console.log(`[MODULE] Loading module ${f}`);
            const moduleConfig = require(`${__dirname}/modules/${f}/module.json`);
            client.modules[f] = {};
            client.modules[f]['config'] = moduleConfig;
            if (moduleConfig['models-dir']) await loadModelsInDir(`./modules/${f}${moduleConfig['models-dir']}`, f);
            if (moduleConfig['commands-dir']) await loadCommandsInDir(`./modules/${f}${moduleConfig['commands-dir']}`, f);
            if (moduleConfig['events-dir']) await loadEventsInDir(`./modules/${f}${moduleConfig['events-dir']}`, f);
            if (moduleConfig['on-load-event']) require(`./modules/${f}/${moduleConfig['on-load-event']}`).onLoad(client.modules[f]);
        } else console.log(`[MODULE] Module ${f} is disabled`);
    }
}

// Load every command in a dictionary
async function loadCommandsInDir(dir, moduleName = null) {
    const files = fs.readdirSync(`${__dirname}/${dir}`);
    for (const f of files) {
        const stats = fs.lstatSync(`${__dirname}/${dir}/${f}`);
        if (!stats) return console.error('no stats');
        if (stats.isFile()) {
            const props = require(`${__dirname}/${dir}/${f}`);
            console.log(`[COMMANDS] Loaded ${dir}/${f}`);
            props.fileName = `${dir}/${f}`;
            client.commands.set(props.help.name, props);
            props.help.aliases.forEach(alias => {
                client.aliases.set(alias, props.help.name);
            });
            if (moduleName) {
                if (client.modules[moduleName]) {
                    if (!client.modules[moduleName]['aliases']) client.modules[moduleName]['aliases'] = new Discord.Collection();
                    if (!client.modules[moduleName]['commands']) client.modules[moduleName]['commands'] = [];
                    client.modules[moduleName]['commands'].push(props.help.name);
                    props.help.aliases.forEach(alias => {
                        client.modules[moduleName]['aliases'].set(alias, props.help.name);
                    });
                }
            }
        } else {
            console.log(`[COMMANDS] Loading commands in subdir ${dir}/${f}`);
            await loadCommandsInDir(`${dir}/${f}`);
        }
    }
}

// Loading every event in a dictionary
async function loadEventsInDir(dir, moduleName = null) {
    fs.readdir(`${__dirname}/${dir}`, (err, files) => {
        if (err) return console.error(err);
        files.forEach(f => {
            fs.lstat(`${__dirname}/${dir}/${f}`, async (err, stats) => {
                if (!stats) return;
                if (stats.isFile()) {
                    const eventFunction = require(`${__dirname}/${dir}/${f}`);
                    const eventStart = eventFunction.run.bind(null, client);
                    const eventName = f.split('.')[0];
                    client.events.set(eventName, eventStart);
                    if (moduleName) {
                        if (client.modules[moduleName]) {
                            if (!client.modules[moduleName]['events']) client.modules[moduleName]['events'] = [];
                            client.modules[moduleName]['events'].push(f.split('.js').join(''));
                        }
                    }
                    client.on(eventName, (...cArgs) => eventFunction.run(client, ...cArgs));
                    console.log(`[EVENTS] Loaded ${dir}/${f}`);
                } else {
                    console.log(`[EVENTS] Loading events in ${dir}/${f}`);
                    await loadEventsInDir(`${dir}/${f}/`);
                }
            });
        });
    });
}

// load every database model in a dictionary
async function loadModelsInDir(dir, moduleName = null) {
    return new Promise(async resolve => {
        await fs.readdir(`${__dirname}/${dir}`, (async (err, files) => {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            for await (const file of files) {
                await loadModule(dir, file, moduleName);
            }
            resolve();
        }));
    });
}

// load one database model
async function loadModule(dir, file, moduleName) {
    return new Promise(async resolve => {
        const stats = fs.lstatSync(`${__dirname}/${dir}/${file}`);
        if (!stats) return;
        if (stats.isFile()) {
            const model = require(`${__dirname}/${dir}/${file}`);
            await model.init(db);
            if (moduleName) {
                if (client.modules[moduleName]) {
                    if (!client.modules[moduleName]['models']) client.modules[moduleName]['models'] = [];
                    client.modules[moduleName]['models'].push(file.split('.js').join(''));
                    if (!models[moduleName]) models[moduleName] = {};
                    models[moduleName][model.config.name] = model;
                }
            } else models[model.config.name] = model;
            console.log(`[DB] Loaded model ${dir}/${file}`);
            resolve(true);
        } else {
            console.log(`[DB] Loading modules in dir ${dir}/${file}`);
            await loadModules(`${dir}/${file}`);
        }
    });
}

module.exports.models = models;
module.exports.client = client;
module.exports.dataDir = dataDir;
module.exports.confDir = confDir;