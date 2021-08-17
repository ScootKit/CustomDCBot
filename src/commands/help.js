const {sendMultipleSiteButtonMessage, formatDate, truncate} = require('../functions/helpers');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (client, msg) {
    const modules = {};
    client.commands.forEach(command => {
        if (!modules[command.help['module']]) modules[command.help['module']] = [];
        modules[command.help['module']].push(command.help.name);
    });
    const sites = [];
    let siteCount = 0;

    const embedFields = [];
    for (const module in modules) {
        let content = '';
        if (module !== 'none') content = `${client.strings.helpembed.more_information_with.split('%prefix%').join(client.config.prefix).split('%modulename%').join(module)}\n`;
        modules[module].forEach(d => {
            let c = d;
            if (client.commands.get(d).help.params) c = `${d} ${client.commands.get(d).help.params}`;
            content = content + `\n\`${client.config.prefix}${c}\`: ${client.commands.get(d).help.description}`;
        });
        embedFields.push({
            name: module === 'none' ? client.strings.helpembed.build_in : `${client.strings.helpembed.module} ${module}`,
            value: truncate(content, 1024)
        });
    }

    embedFields.filter(f => f.name === client.strings.helpembed.build_in).forEach(f => addSite([f, {
        name: '\u200b',
        value: '\u200b'
    }, {
        name: 'ℹ️ Bot-Info',
        value: 'This [Open-Source-Bot](https://github.com/SCNetwork/CustomDCBot) was developed by the [Contributors](https://github.com/SCNetwork/CustomDCBot/graphs/contributors) and the [SC Network](https://sc-network.net)-Team.'
    },
        {
            name: '📊 Stats',
            value: `Active modules: ${Object.keys(client.modules).length}\nRegistered Commands: ${client.commands.size}\nLast restart: ${formatDate(client.readyAt)}\nLast reload: ${formatDate(client.botReadyAt)}`
        }], true));


    let fieldCount = 0;
    let fieldCache = [];
    for (const field of embedFields.filter(f => f.name !== client.strings.helpembed.build_in)) {
        fieldCount++;
        fieldCache.push(field);
        if (fieldCount % 3 === 0) {
            addSite(fieldCache)
            fieldCache = [];
        }
    }
    if (fieldCache.length !== 0) addSite(fieldCache)

    function addSite(fields, atBeginning = false) {
        siteCount++;
        const embed = new MessageEmbed().setColor('RANDOM')
            .setDescription(client.strings.helpembed.description)
            .setThumbnail(client.user.avatarURL())
            .setAuthor(msg.author.tag, msg.author.avatarURL())
            .setFooter(client.strings.footer, client.strings.footerImgUrl)
            .setTitle(client.strings.helpembed.title.split('%site%').join(siteCount))
            .addFields(fields);
        if (atBeginning) sites.unshift(embed);
        else sites.push(embed);
    }

    sendMultipleSiteButtonMessage(msg.channel, sites, [msg.author.id], msg);
};

module.exports.help = {
    'name': 'help',
    'description': 'You can find every command of every module here',
    'module': 'none',
    'aliases': ['help', 'h']
};
module.exports.config = {
    'restricted': false
};