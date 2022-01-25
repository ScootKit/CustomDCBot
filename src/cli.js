const fs = require('fs');
const {reloadConfig} = require('./functions/configuration');
const {syncCommandsIfNeeded} = require('../main');

module.exports.commands = [
    {
        command: 'help',
        description: 'Shows this help message',
        run: function (inputElement) {
            let allCommandString = `Welcome! Currently ${inputElement.cliCommands.length} commands are loaded.\n\n`;
            for (const command of inputElement.cliCommands) {
                if (command.module) allCommandString = allCommandString + `[${command.module}] ${command.originalName || command.command}: ${command.description}\n`;
                else allCommandString = allCommandString + `${command.originalName || command.command}: ${command.description}\n`;
            }
            console.log(allCommandString);
        }
    },
    {
        command: 'license',
        description: 'Shows the license',
        run: function () {
            const license = fs.readFileSync(`${__dirname}/../LICENSE`);
            console.log(license.toString());
        }
    },
    {
        command: 'reload',
        description: 'Reloads the configuration of the bot',
        run: async function (inputElement) {
            if (inputElement.client.logChannel) await inputElement.client.logChannel.send('🔄 Reloading configuration because CLI said so');
            reloadConfig(inputElement.client).then(async () => {
                if (inputElement.client.logChannel) await inputElement.client.logChannel.send('✅ Configuration reloaded successfully.');
                console.log('Reloaded successfully, syncing commands...');
                await syncCommandsIfNeeded();
                console.log('Synced commands, configuration reloaded.');
            }).catch(async () => {
                if (inputElement.client.logChannel) await inputElement.client.logChannel.send('⚠️ Configuration reloaded failed. Bot shutting down');
                console.log('Reload failed. Exiting');
                process.exit(1);
            });
        }
    },
    {
        command: 'modules',
        description: 'Shows all modules of the bot',
        run: async function (inputElement) {
            let message = '=== MODULES ===';
            for (const moduleName in inputElement.client.modules) {
                message = message + `\n• ${moduleName}: ${inputElement.client.modules[moduleName].enabled ? 'Enabled' : 'Disabled'}`;
            }
            console.log(message);
        }
    }
];