const {sendMultipleSiteButtonMessage} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');

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
        content: ':warning: Can\'t generate a leaderboard, because no one has any XP which is odd, but that\'s how it is ¯\\_(ツ)_/¯'
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
            .setFooter(interaction.client.strings.footer, interaction.client.strings.footerImgUrl)
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
                userCount++;
                if (userCount > 6) userString = userString + `<@${user.userID}>: ${user.xp}\n`;
            }
            if (userCount < 5) userString = userString + `and ${userCount - 5} other users`;
            currentSiteFields.push({name: `Level ${level}`, value: userString, inline: true});
            if (i === Object.keys(levels).length || currentSiteFields.length === 6) {
                addSite(currentSiteFields);
                currentSiteFields = [];
            }
        }
    } else {
        let userString = '';
        let i = 0;
        let total = 0;
        for (const user of users) {
            i++;
            total++;
            userString = userString + `**${total}. <@${user.userID}>**: Level ${user.level} - ${user.xp} XP\n`;
            if (i === users.length || i === 20) {
                addSite({
                    name: 'Users',
                    value: userString
                });
                userString = '';
            }
        }
    }

    sendMultipleSiteButtonMessage(interaction.channel, sites, [interaction.user.id], interaction);
};

module.exports.config = {
    name: 'leaderboard',
    description: 'Shows the leaderboard of this guild',
    options: function (client) {
        return [
            {
                type: 'STRING',
                name: 'sort-by',
                description: `How to sort the leaderboard (default: ${client.configurations['levels']['config']['sortLeaderboardBy']})`,
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