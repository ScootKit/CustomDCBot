const {truncate, formatDate, sendMultipleSiteButtonMessage, formatDiscordUserName} = require('../functions/helpers');
const {MessageEmbed} = require('discord.js');
const {localize} = require('../functions/localize');

module.exports.run = async function (interaction) {
    const modules = {};
    for (const command of interaction.client.commands) {
        if (command.module && !interaction.client.modules[command.module].enabled) continue;
        if (!modules[command.module || 'none']) modules[command.module || 'none'] = [];
        modules[command.module || 'none'].push(command);
    }
    const sites = [];
    let siteCount = 0;

    const embedFields = [];
    for (const module in modules) {
        let content = '';
        if (module !== 'none') content = `*${(interaction.client.modules[module]['config']['description'][interaction.client.locale] || interaction.client.modules[module]['config']['description']['en'])}*\n`;
        for (let d of modules[module]) {
            content = content + `\n* \`/${d.name}\`: ${d.description}`;
            d = {...d};
            if (typeof d.options === 'function') d.options = await d.options(interaction.client);
            if ((d.options || []).filter(o => o.type === 'SUB_COMMAND' || o.type === 'SUB_COMMANDS_GROUP').length !== 0) {
                for (const c of d.options) {
                    addSubCommand(c);
                }
            }

            /**
             * Add a bullet-point for a subcommand
             * @private
             * @param {Object} command Command to add
             * @param {String} bulletPointStyle Style of bullet-points to use
             * @param {String} tab Tabs to use to make the message look good
             */
            function addSubCommand(command, tab = '  ') {
                content = content + `\n${tab}* \`${command.name}\`: ${command.description}`;
                if (command.type === 'SUB_COMMAND_GROUP' && (command.options || []).filter(o => o.type === 'SUB_COMMAND').length !== 0) {
                    for (const c of command.options) {
                        addSubCommand(c, '  ');
                    }
                }
            }
        }
        embedFields.push({
            name: `**${module === 'none' ? interaction.client.strings.helpembed.build_in : (interaction.client.modules[module]['config']['humanReadableName'][interaction.client.locale] || interaction.client.modules[module]['config']['humanReadableName']['en'] || module)}**`,
            value: truncate(content, 1024)
        });
    }

    embedFields.filter(f => f.name === '**' + interaction.client.strings.helpembed.build_in + '**').forEach(f => {
        const fields = [
            f
        ];
        if (!interaction.client.strings['putBotInfoOnLastSite']) {
            fields.push({
                name: '\u200b',
                value: '\u200b'
            });
            fields.push({
                name: localize('help', 'bot-info-titel'),
                /*
                    IMPORTANT WARNING:
                    Changing or removing the license notice might be a violation of the Business Source License the bot was licensed under.
                    Violating the license might lead to deactivation of your bot on Discord and legal action being taken against you.
                    Please read the license carefully: https://github.com/ScootKit/CustomDCBot/blob/main/LICENSE
                 */
                value: localize('help', 'bot-info-description', {g: interaction.guild.name})
            });
        }
        if (!interaction.client.strings['disableHelpEmbedStats']) fields.push({
            name: localize('help', 'stats-title'),
            value: localize('help', 'stats-content', {
                am: Object.keys(interaction.client.modules).length,
                rc: interaction.client.commands.length,
                v: interaction.client.scnxSetup ? interaction.client.scnxData.bot.version : null,
                si: interaction.client.scnxSetup ? interaction.client.scnxData.bot.instanceID : null,
                pl: interaction.client.scnxSetup ? localize('scnx', 'plan-' + interaction.client.scnxData.plan) : null,
                lr: formatDate(interaction.client.readyAt),
                lR: formatDate(interaction.client.botReadyAt)
            })
        });
        addSite(
            fields,
            true);
    });


    let fieldCount = 0;
    let fieldCache = [];
    for (const field of embedFields.filter(f => f.name !== '**' + interaction.client.strings.helpembed.build_in + '**')) {
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
            .setAuthor({name: formatDiscordUserName(interaction.user), iconURL: interaction.user.avatarURL()})
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
            .setTitle(interaction.client.strings.helpembed.title.replaceAll('%site%', siteCount))
            .addFields(fields);
        if (atBeginning) sites.unshift(embed);
        else sites.push(embed);
    }

    if (interaction.client.strings['putBotInfoOnLastSite']) sites[sites.length - 1].setFields(...sites[sites.length - 1].fields, {
        name: '\u200b',
        value: '\u200b'
    }, {
        name: localize('help', 'bot-info-titel'),
        /*
                IMPORTANT WARNING:
                Changing or removing the license notice might be a violation of the Business Source License the bot was licensed under.
                Violating the license might lead to deactivation of your bot on Discord and legal action being taken against you.
                Please read the license carefully: https://github.com/ScootKit/CustomDCBot/blob/main/LICENSE
             */
        value: localize('help', 'bot-info-description', {g: interaction.guild.name})
    });

    sendMultipleSiteButtonMessage(interaction.channel, sites, [interaction.user.id], interaction);
};

module.exports.config = {
    name: 'help',
    description: localize('help', 'command-description')
};