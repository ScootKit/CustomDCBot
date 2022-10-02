const {sendMultipleSiteButtonMessage, truncate} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../../src/functions/localize');

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
        content: ':warning: ' + localize('levels', 'no-user-on-leaderboard')
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
            .setColor('GREEN')
            .setThumbnail(interaction.guild.iconURL())
            .setTitle(moduleStrings.leaderboardEmbed.title)
            .setDescription(moduleStrings.leaderboardEmbed.description)
            .addField('\u200b', '\u200b')
            .addFields(fields)
            .addField('\u200b', '\u200b')
            .addField(moduleStrings.leaderboardEmbed.your_level, moduleStrings.leaderboardEmbed.you_are_level_x_with_x_xp.split('%level%').join(thisUser['level']).split('%xp%').join(thisUser['xp']));
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
                if (userCount < 6) userString = userString + `${moduleConfig['useTags'] ? member.user.tag : member.user.toString()}: ${user.xp}\n`;
            }
            if (userCount > 5) userString = userString + localize('levels', 'and-x-other-users', {uc: userCount - 5});
            if (userCount !== 0) currentSiteFields.push({name: localize('levels', 'level', {l: level}), value: userString, inline: true});
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
                u: moduleConfig['useTags'] ? member.user.tag : member.user.toString(),
                l: user.level,
                xp: user.xp
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