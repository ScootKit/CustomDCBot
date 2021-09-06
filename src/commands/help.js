const {truncate, formatDate, sendMultipleSiteButtonMessage} = require('../functions/helpers');
const {MessageEmbed} = require('discord.js');
module.exports.run = async function (interaction) {
    const modules = {};
    interaction.client.commands.forEach(command => {
        if (!modules[command.module || 'none']) modules[command.module || 'none'] = [];
        modules[command.module || 'none'].push(command);
    });
    const sites = [];
    let siteCount = 0;

    const embedFields = [];
    for (const module in modules) {
        let content = '';
        if (module !== 'none') content = `${interaction.client.strings.helpembed.more_information_with.split('%prefix%').join(interaction.client.config.prefix).split('%modulename%').join(module)}\n`;
        modules[module].forEach(d => {
            content = content + `\n\`/${d.name}\`: ${d.description}`;
        });
        embedFields.push({
            name: module === 'none' ? interaction.client.strings.helpembed.build_in : `${interaction.client.strings.helpembed.module} ${module}`,
            value: truncate(content, 1024)
        });
    }

    embedFields.filter(f => f.name === interaction.client.strings.helpembed.build_in).forEach(f => addSite(
        [
            f,
            {
                name: '\u200b',
                value: '\u200b'
            },
            {
                name: 'ℹ️ Bot-Info',
                value: 'This [Open-Source-Bot](https://github.com/SCNetwork/CustomDCBot) was developed by the [Contributors](https://github.com/SCNetwork/CustomDCBot/graphs/contributors) and the [SC Network](https://sc-network.net)-Team.'
            },
            {
                name: '📊 Stats',
                value: `Active modules: ${Object.keys(interaction.client.modules).length}\nRegistered Commands: ${interaction.client.commands.length}\nRegistered Message-Commands: ${interaction.client.messageCommands.size}\nLast restart: ${formatDate(interaction.client.readyAt)}\nLast reload: ${formatDate(interaction.client.botReadyAt)}`
            }
        ],
        true));


    let fieldCount = 0;
    let fieldCache = [];
    for (const field of embedFields.filter(f => f.name !== interaction.client.strings.helpembed.build_in)) {
        fieldCount++;
        fieldCache.push(field);
        if (fieldCount % 3 === 0) {
            addSite(fieldCache);
            fieldCache = [];
        }
    }
    if (fieldCache.length !== 0) addSite(fieldCache);

    /**
     * Adds a site to the embed
     * @param {Array<Field>} fields Fields to add
     * @param atBeginning If this site needs to go at the beginning of the array
     * @private
     */
    function addSite(fields, atBeginning = false) {
        siteCount++;
        const embed = new MessageEmbed().setColor('RANDOM')
            .setDescription(interaction.client.strings.helpembed.description)
            .setThumbnail(interaction.client.user.avatarURL())
            .setAuthor(interaction.user.tag, interaction.user.avatarURL())
            .setFooter(interaction.client.strings.footer, interaction.client.strings.footerImgUrl)
            .setTitle(interaction.client.strings.helpembed.title.split('%site%').join(siteCount))
            .addFields(fields);
        if (interaction.client.messageCommands.size !== 1) embed.addField('ℹ️ Message-Commands', `You probably miss **${interaction.client.messageCommands.size - 1} commands** by using slash-commands - please use \`${interaction.client.config.prefix}help\` to see all available message-commands`); // There is always one message command: !help
        if (atBeginning) sites.unshift(embed);
        else sites.push(embed);
    }

    sendMultipleSiteButtonMessage(interaction.channel, sites, [interaction.user.id], interaction);
};

module.exports.config = {
    name: 'help',
    description: 'Show every commands'
};