const Discord = require('discord.js');
const client = new Discord.Client({
    allowedMentions: {parse: ['users', 'roles']}, // Disables @everyone mentions because everyone hates them
    intents: [Discord.Intents.FLAGS.GUILDS, 'GUILD_BANS', 'DIRECT_MESSAGES', 'GUILD_MESSAGES', 'GUILD_PRESENCES', 'GUILD_INVITES', 'GUILD_MESSAGE_REACTIONS', 'GUILD_EMOJIS_AND_STICKERS', 'GUILD_MEMBERS', 'GUILD_WEBHOOKS']
});
const fs = require('fs');
const {Sequelize} = require('sequelize');
const log4js = require('log4js');
const jsonfile = require('jsonfile');
const readline = require('readline');
const cliCommands = [];
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.on('line', (input) => {
    if (!client.botReadyAt) {
        rl.prompt(true);
        return console.error('The bot is not ready yet. Please wait until the bot gets ready to use the cli.');
    }
    const command = cliCommands.find(c => c.command === input.split(' ')[0].toLowerCase());
    if (!command) {
        return console.error('Command not found. Use "help" to see all available commands.');
    }
    console.log('\n');
    command.run({
        input,
        args: input.split(' '),
        client,
        cliCommands
    });
    rl.prompt(true);
});

// Parsing parameters
let config;
let confDir = `${__dirname}/config`;
let dataDir = `${__dirname}/data`;
const args = process.argv.slice(2);
let scnxSetup = false; // If enabled some other (closed-sourced) files get imported and executed
if (process.argv.includes('--scnx-enabled')) scnxSetup = true;
if (args[0] === '--help' || args[0] === '-h') {
    process.exit();
}
if (args[0] && args[1]) {
    confDir = args[0];
    dataDir = args[1];
}
log4js.configure({
    pm2: process.argv.includes('--pm2-setup'),
    appenders: {
        out: {type: 'stdout'}
    },
    categories: {
        default: {appenders: ['out'], level: 'debug'}
    }
});
const logger = log4js.getLogger();
logger.level = process.env.LOGLEVEL || 'debug';
// Loading config
try {
    config = jsonfile.readFileSync(`${confDir}/config.json`);
} catch (e) {
    logger.fatal('Missing config.json! Run "npm run generate-config <ConfDir>" (Parameter ConfDir is optional) to generate it');
    process.exit(1);
}

const models = {}; // Object with all models

client.messageCommands = new Discord.Collection();
client.aliases = new Discord.Collection();
client.events = new Discord.Collection();
client.modules = {};
client.guildID = config['guildID'];
client.config = config;
client.configDir = confDir;
client.dataDir = dataDir;
client.configurations = {};
logger.level = config.logLevel || process.env.LOGLEVEL || 'debug';
module.exports.logger = logger;
client.logger = logger;
const configChecker = require('./src/functions/configuration');
const {compareArrays} = require('./src/functions/helpers');
logger.info(`CustomBot v2 - Log-Level: ${logger.level}`);

let moduleConf = {};
try {
    moduleConf = jsonfile.readFileSync(`${confDir}/modules.json`);
} catch (e) {
    logger.info('Missing moduleConfig-file. Automatically disabling all modules and overwriting modules.json later');
}

// Connecting to Database
const db = new Sequelize({
    dialect: 'sqlite',
    storage: `${dataDir}/database.sqlite`,
    logging: false
});

const commands = [];

// Starting bot
db.authenticate().then(async () => {
    await loadModules();
    await loadEventsInDir('./src/events');
    await db.sync();
    logger.info('[DB] Synced db');
    await loadMessageCommandsInDir('./src/message-commands');
    await client.login(config.token).catch(() => {
        logger.fatal('Bot could not log in. Please double-check your token and try again');
        process.exit();
    });
    client.guild = await client.guilds.fetch(config.guildID).catch(() => {
        logger.error(`Please invite the bot to your guild before continuing or check your configuration: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`);
        process.exit(1);
    });
    logger.info(`[BOT] Client logged in as ${client.user.tag} and is now online!`);
    loadCLIFile('/src/cli.js');
    client.models = models;
    client.moduleConf = moduleConf;
    client.logChannel = await client.channels.fetch(config.logChannelID).catch(() => {
    });
    if (!client.logChannel || client.logChannel.type !== 'GUILD_TEXT') logger.warn('LogChannel is not set or wrong type');
    await configChecker.loadAllConfigs(client, moduleConf).catch(async () => {
        if (client.logChannel) await client.logChannel.send('⚠ Configuration-Checking failed. Find more information in your log. The bot exited.');
        process.exit(1);
    });
    await loadCommandsInDir('./src/commands');
    await loadModuleCommands();
    await syncCommandsIfNeeded();
    client.commands = commands;
    client.strings = jsonfile.readFileSync(`${confDir}/strings.json`);
    if (scnxSetup) await require('./src/functions/scnx-integration').init(client);
    client.emit('botReady');
    client.botReadyAt = new Date();
    logger.info('[BOT] The bot initiated successfully and is now listening to commands.');
    if (client.logChannel) client.logChannel.send('🚀 The bot initiated successfully and is now listening to commands.');
    rl.prompt(true);
});

/**
 * Syncs commands if needed
 * @returns {Promise<void>}
 */
async function syncCommandsIfNeeded() {
    const oldCommands = await (await client.guilds.fetch(config.guildID)).commands.fetch();
    let needSync = false;
    if (oldCommands.size !== commands.length) needSync = true;
    if (!needSync) for (const command of commands) {
        const oldCommand = oldCommands.find(c => c.name === command.name);
        if (!oldCommand) {
            needSync = true;
            break;
        }

        if (typeof command.permissions === 'function') command.permissions = await command.permissions(client);
        if (typeof command.options === 'function') command.options = await command.options(client);

        if (oldCommand.description !== command.description || oldCommand.options.length !== command.options.length || oldCommand.defaultPermission !== command.defaultPermission) {
            needSync = true;
            break;
        }

        if (!compareArrays(await oldCommand.permissions.fetch({guild: client.guild, command: oldCommand}).catch(() => {
        }) || [], command.permissions)) {
            await oldCommand.permissions.set({permissions: command.permissions});
            logger.debug(`Synced permissions for /${command.name}`);
        }

        for (const option of (command.options || [])) {
            const oldOptionOption = (oldCommand.options || []).find(o => o.name === option.name);
            if (!oldOptionOption) {
                needSync = true;
                break;
            }
            if (checkOption(oldOptionOption, option)) {
                needSync = true;
                break;
            }
        }

        /**
         * Checks if two command options are identical
         * @private
         * @param {Object<ApplicationCommandOptions>} oldOption Old options
         * @param {Object<ApplicationCommandOptions>} newOption New options
         * @returns {Boolean} If synchronisation is needed
         */
        function checkOption(oldOption, newOption) {
            if (oldOption.name !== newOption.name || oldOption.description !== newOption.description || oldOption.type !== newOption.type || oldOption.required !== newOption.required) return true;
            if (!compareArrays(oldOption.choices || [], newOption.choices || [])) return true;
            if ((oldOption.options || []).length !== (newOption.options || []).length) return true;
            for (const option of (newOption.options || [])) {
                const oldOptionOption = (oldOption.options || []).find(o => o.name === option.name);
                if (!oldOptionOption) return true;
                if (checkOption(oldOptionOption, option)) return true;
            }
            return false;
        }
    }
    if (needSync) {
        await client.application.commands.set(commands, config.guildID);
        logger.info(`Synced application commands`);
    } else logger.info('Application commands are up to date - no syncing required');
}

const moduleCommandsToBeLoaded = [];

/**
 * Loads all modules
 * @returns {Promise<void>}
 * @private
 */
async function loadModules() {
    if (!fs.existsSync(`${__dirname}/modules/`)) fs.mkdirSync(`${__dirname}/modules/`);
    const files = fs.readdirSync(`${__dirname}/modules/`);
    for (const f of files) {
        if (moduleConf[f]) {
            logger.debug(`[MODULE] Loading module ${f}`);
            const moduleConfig = jsonfile.readFileSync(`${__dirname}/modules/${f}/module.json`);
            client.modules[f] = {};
            client.modules[f]['config'] = moduleConfig;
            client.configurations[f] = {};
            if (moduleConfig['models-dir']) await loadModelsInDir(`./modules/${f}${moduleConfig['models-dir']}`, f);
            if (moduleConfig['message-commands-dir']) await loadMessageCommandsInDir(`./modules/${f}${moduleConfig['commands-dir']}`, f);
            if (moduleConfig['commands-dir']) moduleCommandsToBeLoaded.push({
                dir: `./modules/${f}${moduleConfig['commands-dir']}`,
                moduleName: f
            });
            if (moduleConfig['events-dir']) await loadEventsInDir(`./modules/${f}${moduleConfig['events-dir']}`, f);
            if (moduleConfig['on-load-event']) require(`./modules/${f}/${moduleConfig['on-load-event']}`).onLoad(client.modules[f]);
            if (moduleConfig['cli']) loadCLIFile(`./modules/${f}/${moduleConfig['cli']}`, f);
        } else logger.debug(`[MODULE] Module ${f} is disabled`);
    }
}

/**
 * Loads all remaining module commands
 * @private
 * @returns {Promise<void>}
 */
async function loadModuleCommands() {
    for (const dir of moduleCommandsToBeLoaded) {
        await loadCommandsInDir(dir.dir, dir.moduleName);
    }
}

/**
 * Load every command in a directory
 * @param {String} dir Directory to load commands from
 * @param {String} moduleName Name of module currently loading from
 * @returns {Promise<void>}
 * @private
 */
async function loadCommandsInDir(dir, moduleName = null) {
    const files = fs.readdirSync(`${__dirname}/${dir}`);
    for (const f of files) {
        const stats = fs.lstatSync(`${__dirname}/${dir}/${f}`);
        if (!stats) return logger.error('No stats returned');
        if (stats.isFile()) {
            const props = require(`${__dirname}/${dir}/${f}`);
            const permissions = props.config.permissions || [];
            if (props.config.restricted) for (const botOperatorID of config.botOperators || []) {
                permissions.push({
                    id: botOperatorID,
                    type: 'USER',
                    permission: true
                });
            }
            console.log(props.config, props.config.restricted, props.config.defaultPermission);
            commands.push({
                name: props.config.name,
                description: props.config.description,
                restricted: props.config.restricted,
                options: props.config.options || [],
                subcommands: props.subcommands,
                permissions,
                run: props.run,
                defaultPermission: props.config.restricted ? false : props.config.defaultPermission || true,
                module: moduleName
            });
        }
    }
}

/**
 * Load every message command in a directory
 * @param {String} dir Directory to load commands from
 * @param {String} moduleName Name of module currently loading from
 * @returns {Promise<void>}
 * @private
 */
async function loadMessageCommandsInDir(dir, moduleName = null) {
    const files = fs.readdirSync(`${__dirname}/${dir}`);
    for (const f of files) {
        const stats = fs.lstatSync(`${__dirname}/${dir}/${f}`);
        if (!stats) return logger.error('No stats returned');
        if (stats.isFile()) {
            const props = require(`${__dirname}/${dir}/${f}`);
            logger.debug(`[COMMANDS] Loaded ${dir}/${f}`);
            props.fileName = `${dir}/${f}`;
            props.help.module = moduleName || 'none';
            if (props.config.args && typeof props.config.args === 'boolean') {
                logger.error(`Command ${dir}/${f}: props.config.args can not longer be an integer, please read more in the Changelog (CHANGELOG.md).`);
                process.exit(1);
            }
            client.messageCommands.set(props.help.name, props);
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
            logger.debug(`[COMMANDS] Loading commands in subdir ${dir}/${f}`);
            await loadMessageCommandsInDir(`${dir}/${f}`);
        }
    }
}

/**
 * Load all events from a directory
 * @param {String} dir Directory to load events from
 * @param {String} moduleName Name of module currently loading from
 * @returns {Promise<void>}
 * @private
 */
async function loadEventsInDir(dir, moduleName = null) {
    fs.readdir(`${__dirname}/${dir}`, (err, files) => {
        if (err) return logger.error(err);
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
                    logger.debug(`[EVENTS] Loaded ${dir}/${f}`);
                } else {
                    logger.debug(`[EVENTS] Loading events in ${dir}/${f}`);
                    await loadEventsInDir(`${dir}/${f}/`);
                }
            });
        });
    });
}

/**
 * Load every database model in a directory
 * @param {String} dir Directory to load models from
 * @param {String} moduleName Name of module currently loading from
 * @returns {Promise<void>}
 * @private
 */
async function loadModelsInDir(dir, moduleName = null) {
    return new Promise(async resolve => {
        await fs.readdir(`${__dirname}/${dir}`, (async (err, files) => {
            if (err) {
                logger.fatal(err);
                process.exit(1);
            }
            for await (const file of files) {
                await loadModel(dir, file, moduleName);
            }
            resolve();
        }));
    });
}

/**
 * Loads a database model
 * @param {String} dir Directory to load models from
 * @param {String} file File to load model from
 * @param {String} moduleName Name of module currently loading from
 * @returns {Promise<void>}
 * @private
 */
async function loadModel(dir, file, moduleName) {
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
            logger.debug(`[DB] Loaded model ${dir}/${file}`);
            resolve(true);
        } else {
            logger.debug(`[DB] Loading modules in dir ${dir}/${file}`);
            await loadModules(`${dir}/${file}`);
        }
    });
}

/**
 * Load a CLI-File
 * @param {String} path Path to the CLI-File
 * @param {String} moduleName Name of the module
 * @returns {void}
 */
function loadCLIFile(path, moduleName = null) {
    const file = require(`${__dirname}/${path}`);
    for (const command of file.commands) {
        command.originalName = command.command;
        command.module = moduleName;
        cliCommands.push(command);
        command.command = command.command.toLowerCase();
        logger.debug(`[CLI] Loaded ${command.command} of ${path}`);
    }
}

module.exports.models = models;
module.exports.client = client;
module.exports.dataDir = dataDir;
module.exports.syncCommandsIfNeeded = syncCommandsIfNeeded;
module.exports.confDir = confDir;