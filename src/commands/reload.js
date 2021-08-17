const {sendMultipleSiteButtonMessage, formatDate, truncate} = require('../functions/helpers');
const {MessageEmbed} = require('discord.js');
const {reloadConfig} = require('../functions/configuration');

module.exports.run = async function (client, msg) {
    const m = await msg.reply('Just a sec...')
    await reloadConfig(client);
    m.edit('Done :+1:')
};

module.exports.help = {
    'name': 'reload',
    'description': 'Reloads configuration files',
    'module': 'none',
    'aliases': ['reload', 'r']
};
module.exports.config = {
    'restricted': false
};