const {MessageEmbed} = require('discord.js');

module.exports.run = async function (client, msg) {
    const modules = {};
    client.commands.forEach(command => {
        if (!modules[command.help['module']]) modules[command.help['module']] = [];
        modules[command.help['module']].push(command.help.name);
    });
    const helpEmbed = new MessageEmbed().setColor('RANDOM').setTitle(client.strings.helpembed.title).setDescription(client.strings.helpembed.description).setThumbnail(client.user.avatarURL());
    for (const module in modules) {
        let content;
        if (module !== 'none') {
            content = `${client.strings.helpembed.more_information_with.split('%prefix%').join(client.config.prefix).split('%modulename%').join(module)}\n`;
        } else {
            content = '';
        }
        modules[module].forEach(d => {
            let c = d;
            if (client.commands.get(d).help.params) c = `${d} ${client.commands.get(d).help.params}`;
            content = content + `\n\`${client.config.prefix}${c}\`: ${client.commands.get(d).help.description}`;
        });
        if (module !== 'none') {
            helpEmbed.addField(`${client.strings.helpembed.module} ${module}`, content);
        } else {
            helpEmbed.addField(client.strings.helpembed.build_in, content);
        }
    }
    helpEmbed.addField('\u200b', '\u200b');
    // Play fair and do not remove this. Com'on its only one embed field. Thanks, love you <3
    helpEmbed.addField('ℹ️ Bot-Info', 'This [Open-Source-Bot](https://github.com/SCNetwork/CustomDCBot) was developed by the [Contributors](https://github.com/SCNetwork/CustomDCBot/graphs/contributors) and the [SC Network](https://sc-network.net)-Team.');
    await msg.channel.send(helpEmbed);
};

module.exports.help = {
    'name': 'help',
    'description': 'See all commands and modules',
    'module': 'none',
    'aliases': ['help', 'h']
};
module.exports.config = {
    'restricted': false
};