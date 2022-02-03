const Discord = require('discord.js');
const client = new Discord.Client({
    allowedMentions: {parse: ['users', 'roles']}, // Disables @everyone mentions because everyone hates them
    intents: [Discord.Intents.FLAGS.GUILDS, 'GUILD_BANS', 'DIRECT_MESSAGES', 'GUILD_MESSAGES', 'GUILD_VOICE_STATES', 'GUILD_PRESENCES', 'GUILD_INVITES', 'GUILD_MESSAGE_REACTIONS', 'GUILD_EMOJIS_AND_STICKERS', 'GUILD_MEMBERS', 'GUILD_WEBHOOKS']
});
client.intervals = [];
client.jobs = [];
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
});

// Parsing parameters
let config;
let confDir = `${__dirname}/config`;
let dataDir = `${__dirname}/data`;
const args = process.argv.slice(2);
let scnxSetup = false; // If enabled some other (closed-sourced) files get imported and executed
if (process.argv.includes('--scnx-enabled')) scnxSetup = true;
client.scnxSetup = scnxSetup;
if (args[0] === '--help' || args[0] === '-h') {
    process.exit();
}
if (args[0] && args[1]) {
    confDir = args[0];
    dataDir = args[1];
}
client.locale = process.argv.find(a => a.startsWith('--lang')) ? (process.argv.find(a => a.startsWith('--lang')).split('--lang=')[1] || 'en') : 'en';
module.exports.client = client;
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

process.on('uncaughtException', async e => {
    console.error(e);
    process.exit(1);
});

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
client.setMaxListeners(50);
client.dataDir = dataDir;
client.configurations = {};
logger.level = config.logLevel || process.env.LOGLEVEL || 'debug';
client.logger = logger;
module.exports.logger = logger;
const configChecker = require('./src/functions/configuration');
const {compareArrays, checkForUpdates} = require('./src/functions/helpers');
const {localize} = require('./src/functions/localize');
logger.info(localize('main', 'startup-info', {l: logger.level}));


let moduleConf = {};
try {
    moduleConf = jsonfile.readFileSync(`${confDir}/modules.json`);
} catch (e) {
    logger.info(localize('main', 'missing-moduleconf'));
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
    if (scnxSetup) client.scnxHost = client.config.scnxHostOverwirde || 'https://scnx.xyz';
    await loadModelsInDir('/src/models');
    await loadModules();
    await loadEventsInDir('./src/events');
    await db.sync();
    logger.info(localize('main', 'sync-db'));
    await loadMessageCommandsInDir('./src/message-commands');
    await client.login(config.token).catch(() => {
        logger.fatal(localize('main', 'login-error'));
        process.exit();
    });
    client.guild = await client.guilds.fetch(config.guildID).catch(() => {
        logger.error(localize('main', 'not-invited', {inv: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&guild_id=${config.guildID}&disable_guild_select=true&permissions=8&scope=bot%20applications.commands`}));
        process.exit(1);
    });
    logger.info(localize('main', 'logged-in', {tag: client.user.tag}));
    loadCLIFile('/src/cli.js');
    client.models = models;
    client.moduleConf = moduleConf;
    client.logChannel = await client.channels.fetch(config.logChannelID).catch(() => {
    });
    if (!client.logChannel || client.logChannel.type !== 'GUILD_TEXT') {
        logger.warn(localize('main', 'logchannel-wrong-type'));
        client.logChannel = null;
    }
    await configChecker.loadAllConfigs(client, moduleConf).catch(async () => {
        if (client.logChannel) await client.logChannel.send('⚠ ' + localize('main', 'config-check-failed'));
        process.exit(1);
    });
    if (scnxSetup) await require('./src/functions/scnx-integration').beforeInit(client);
    await loadCommandsInDir('./src/commands');
    await loadModuleCommands();
    await syncCommandsIfNeeded();
    client.commands = commands;
    client.strings = jsonfile.readFileSync(`${confDir}/strings.json`);
    client.emit('botReady');
    client.botReadyAt = new Date();
    if (scnxSetup) await require('./src/functions/scnx-integration').init(client);
    logger.info(localize('main', 'bot-ready'));
    if (client.logChannel) client.logChannel.send('🚀 ' + localize('main', 'bot-ready'));
    await checkForUpdates(client);
    rl.prompt(true);
});

/**
 * Syncs commands if needed
 * @returns {Promise<void>}
 */
async function syncCommandsIfNeeded() {
    const oldCommands = await (await client.guilds.fetch(config.guildID)).commands.fetch().catch(() => {
        logger.fatal(localize('main', 'no-command-permissions', {inv: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&guild_id=${config.guildID}&disable_guild_select=true&permissions=8&scope=bot%20applications.commands`}));
        process.exit(1);
    });
    let needSync = false;
    if (oldCommands.size !== commands.length) needSync = true;
    const ranCommands = []; // Commands with all functions run
    for (const orgCmd of commands) {
        const command = {...orgCmd};
        if (typeof command.permissions === 'function') command.permissions = await command.permissions(client);
        if (typeof command.options === 'function') command.options = await command.options(client);
        if (command.options) {
            const options = [];
            for (const option of command.options) {
                if (option.options && typeof option.options === 'function') option.options = await option.options(client);
                options.push(option);
            }
            command.options = options;
        }
        ranCommands.push(command);
    }

    if (!needSync) for (const command of ranCommands) {
        const oldCommand = oldCommands.find(c => c.name === command.name);
        if (!oldCommand) {
            needSync = true;
            break;
        }

        if (oldCommand.description !== command.description || (oldCommand.options || []).length !== (command.options || []).length || oldCommand.defaultPermission !== (typeof command.defaultPermission === 'undefined' ? true : command.defaultPermission)) {
            needSync = true;
            break;
        }

        if (!compareArrays(await oldCommand.permissions.fetch({guild: client.guild, command: oldCommand}).catch(() => {
        }) || [], command.permissions)) {
            await oldCommand.permissions.set({permissions: command.permissions}).catch((e) => {
                logger.error(localize('main', 'perm-sync-failed', {c: command.name, e}));
            }).then(() => {
                logger.debug(localize('main', 'perm-sync', {c: command.name}));
            });
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
            if (oldOption.name !== newOption.name || oldOption.autocomplete !== newOption.autocomplete || oldOption.description !== newOption.description || oldOption.type !== newOption.type || (typeof oldOption.required === 'undefined' ? false : oldOption.required) !== (typeof newOption.required === 'undefined' ? false : newOption.required)) return true;
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
        await client.application.commands.set(ranCommands, config.guildID).catch(async (e) => {
            logger.debug(JSON.stringify(commands), e);
            logger.fatal(localize('main', 'no-command-permissions', {inv: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&guild_id=${config.guildID}&disable_guild_select=true&permissions=8&scope=bot%20applications.commands`}));
            process.exit(1);
        });
        logger.info(localize('main', 'command-sync'));
    } else logger.info(localize('main', 'command-no-sync-required'));
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
            logger.debug(localize('main', 'loading-module', {m: f}));
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
            if (moduleConfig['on-load-event']) require(`./modules/${f}/${moduleConfig['on-load-event']}`).onLoad(client);
            if (moduleConfig['cli']) loadCLIFile(`./modules/${f}/${moduleConfig['cli']}`, f);
        } else logger.debug(localize('main', 'module-disabled', {m: f}));
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
            if (props.config.restricted) props.config.defaultPermission = false;
            commands.push({
                name: props.config.name,
                description: props.config.description,
                restricted: props.config.restricted,
                options: props.config.options || [],
                subcommands: props.subcommands,
                beforeSubcommand: props.beforeSubcommand,
                permissions,
                run: props.run,
                defaultPermission: props.config.defaultPermission,
                autoComplete: props.autoComplete,
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
            logger.debug(localize('main', 'command-loaded', {d: dir, f: f}));
        } else {
            logger.debug(localize('main', 'command-dir', {d: dir, f: f}));
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
                    client.on(eventName, (...cArgs) => {
                        try {
                            eventFunction.run(client, ...cArgs);
                        } catch (e) {
                            client.logger.error(`Error on event ${(moduleName ? moduleName + '/' : '') + eventName}: ${e}`);
                        }
                    });
                    logger.debug(localize('main', 'event-loaded', {d: dir, f: f}));
                } else {
                    logger.debug(localize('main', 'event-dir', {d: dir, f: f}));
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
            logger.debug(localize('main', 'model-loaded', {d: dir, f: file}));
            resolve(true);
        } else {
            logger.debug(localize('main', 'model-dir', {d: dir, f: file}));
            await loadModel(`${dir}/${file}`);
        }
    });
}

/**
 * Load a CLI-File
 * @private
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
        logger.debug(localize('main', 'loaded-cli', {c: command.command, p: path}));
    }
}

module.exports.models = models;
module.exports.dataDir = dataDir;
module.exports.syncCommandsIfNeeded = syncCommandsIfNeeded;
module.exports.confDir = confDir;