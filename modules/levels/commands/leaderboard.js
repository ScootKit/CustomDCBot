const {
    sendMultipleSiteButtonMessage,
    truncate,
    formatNumber,
    formatDiscordUserName,
    parseEmbedColor
} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../../src/functions/localize');
const {displayLevel, isMaxLevel, calculateLevelXP} = require('../events/messageCreate');
const {client} = require('../../../main');

module.exports.run = async function (interaction) {
    const moduleStrings = interaction.client.configurations['levels']['strings'];
    const moduleConfig = interaction.client.configurations['levels']['config'];
    const sortBy = interaction.options.getString('sort-by') || moduleConfig.sortLeaderboardBy;
    const users = await interaction.client.models['levels']['User'].findAll({
        order: [
            ['xp', 'DESC']
        ]
    });
    if (users.length === 0) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('levels', 'no-user-on-leaderboard')
    });
    const thisUser = users.find(u => u.userID === interaction.user.id);

    const sites = [];

    /**
     * Adds a site
     * @private
     * @param {Array} fields
     */
    function addSite(fields) {
        const embed = new MessageEmbed()
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
            .setColor(parseEmbedColor(moduleStrings.leaderboardEmbed.color || 'GREEN'))
            .setThumbnail(interaction.guild.iconURL())
            .setTitle(moduleStrings.leaderboardEmbed.title)
            .setDescription(moduleStrings.leaderboardEmbed.description)
            .addField('\u200b', '\u200b')
            .addFields(fields);
        if (thisUser) embed.addField('\u200b', '\u200b').addField(moduleStrings.leaderboardEmbed.your_level, moduleStrings.leaderboardEmbed.you_are_level_x_with_x_xp.split('%level%').join(displayLevel(thisUser['level'], client)).split('%xp%').join(formatNumber(thisUser['xp'])));
        sites.push(embed);
    }

    if (sortBy === 'levels') {
        const levels = {};
        const levelArray = [];
        for (const user of users) {
            if (!levels[user.level]) {
                levels[user.level] = [];
                levelArray.push(user.level);
            }
            levels[user.level].push(user);
        }
        let currentSiteFields = [];
        let i = 0;
        levelArray.sort(function (a, b) {
            return b - a;
        });
        for (const level of levelArray) {
            i++;
            let userString = '';
            let userCount = 0;
            for (const user of levels[level]) {
                const member = interaction.guild.members.cache.get(user.userID);
                if (!member) continue;
                userCount++;
                if (userCount < 6) userString = userString + localize('levels', 'leaderboard-notation', {
                    p: userCount,
                    u: moduleConfig['useTags'] ? formatDiscordUserName(member.user) : member.user.toString(),
                    l: displayLevel(user.level, client),
                    xp: formatNumber(isMaxLevel(user.level, client) ? calculateLevelXP(client, client.configurations['levels']['config'].maximumLevel) : user.xp)
                }) + '\n';
            }
            if (userCount > 5) userString = userString + localize('levels', 'and-x-other-users', {uc: userCount - 5});
            if (userCount !== 0) currentSiteFields.push({
                name: localize('levels', 'level', {l: displayLevel(level, client)}),
                value: userString,
                inline: true
            });
            if (i === Object.keys(levels).length || currentSiteFields.length === 6) {
                addSite(currentSiteFields);
                currentSiteFields = [];
            }
        }
    } else {
        let userString = '';
        let i = 0;
        for (const user of users) {
            const member = interaction.guild.members.cache.get(user.userID);
            if (!member) continue;
            i++;
            userString = userString + localize('levels', 'leaderboard-notation', {
                p: i,
                u: moduleConfig['useTags'] ? formatDiscordUserName(member.user) : member.user.toString(),
                l: displayLevel(user.level, client),
                xp: formatNumber(isMaxLevel(user.level, client) ? calculateLevelXP(client, client.configurations['levels']['config'].maximumLevel) : user.xp)
            }) + '\n';
            if (i === users.filter(u => interaction.guild.members.cache.get(u.userID)).length || i % 20 === 0) {
                addSite([{
                    name: localize('levels', 'users'),
                    value: truncate(userString, 1024)
                }]);
                userString = '';
            }
        }
    }

    sendMultipleSiteButtonMessage(interaction.channel, sites, [interaction.user.id], interaction);
};

module.exports.config = {
    name: 'leaderboard',
    description: localize('levels', 'leaderboard-command-description'),
    options: function (client) {
        return [
            {
                type: 'STRING',
                name: 'sort-by',
                description: localize('levels', 'leaderboard-sortby-description', {d: client.configurations['levels']['config']['sortLeaderboardBy']}),
                required: false,
                choices: [
                    {
                        name: 'levels',
                        value: 'levels'
                    }, {
                        name: 'xp',
                        value: 'xp'
                    }
                ]
            }
        ];
    }
};