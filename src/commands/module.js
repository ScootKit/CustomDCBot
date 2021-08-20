const {embedType} = require('../functions/helpers');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (client, msg, args) {
    const module = client.modules[args[0]];
    if (!module) return msg.channel.send(...embedType(client.strings.module.not_found));
    const moduleEmbed = new MessageEmbed()
        .setTitle(`${module.config.name.charAt(0).toUpperCase() + module.config.name.slice(1)} by ${module.config.author.name}`)
        .setDescription(module.config.description)
        .setColor('RANDOM')
        .addField('Author', `[${module.config.author.name}](${module.config.author.link})`)
        .setFooter(`See all command with "${client.config.prefix}help"`);
    let content = '';
    module.commands.forEach(c => {
        content = content + `\n\`${client.config.prefix}${c}\`: ${client.commands.get(c).help.description}`;
    });
    moduleEmbed.addField('Commands', content);
    await msg.channel.send(moduleEmbed);
};

module.exports.help = {
    'name': 'module',
    'description': 'Find out more about an module',
    'params': '<Module-Name>',
    'module': 'none',
    'aliases': ['module', 'm']
};
module.exports.config = {
    'restricted': false,
    'args': 1
};