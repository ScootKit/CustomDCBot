const {confDir} = require('./../../../main');
const {MessageEmbed} = require('discord.js');

// ToDo Rework this. The code is awful.

module.exports.run = async function (client, msg) {
    const moduleStrings = require(`${confDir}/levels/strings.json`);
    const users = await client.models['levels']['User'].findAll();
    const user = await client.models['levels']['User'].findOne({
        where: {
            userID: msg.author.id
        }
    });
    const sortedUsersByLevel = {};
    const usedLevels = [];
    users.forEach((u) => {
        if (!usedLevels.includes(u.dataValues.level)) usedLevels.push(u.dataValues.level);
        if (!sortedUsersByLevel[u.dataValues.level]) sortedUsersByLevel[u.dataValues.level] = {};
        sortedUsersByLevel[u.dataValues.level][u.dataValues.userID] = u.dataValues.xp;
    });
    usedLevels.forEach(l => {
        sortedUsersByLevel[l] = Object.fromEntries( // This took fucking forever
            Object.entries(sortedUsersByLevel[l]).sort(([, a], [, b]) => b - a)
        );
    });
    const embed = new MessageEmbed()
        .setFooter(client.strings.footer)
        .setColor('GREEN')
        .setThumbnail(msg.guild.iconURL())
        .setTitle(moduleStrings.leaderboardEmbed.title)
        .setDescription(moduleStrings.leaderboardEmbed.description);
    usedLevels.sort(function (a, b) {
        return b - a;
    });
    let shownLevels = 0;
    usedLevels.forEach(l => {
        shownLevels = shownLevels + 1;
        if (shownLevels > 6) return;
        let content = '';
        let i = 0;
        let y = 0;
        sortedUsersByLevel[l].forEach(() => {
            y = y + 1;
        });
        for (const u in sortedUsersByLevel[l]) {
            if (i >= 5) continue;
            i = i + 1;
            content = content + `\n<@${u}>: ${sortedUsersByLevel[l][u]} XP`;
        }
        if (i > 5) content = content + '\n\n' + moduleStrings.leaderboardEmbed.and_x_more_people.split('%count%').join(y - 1);
        if (shownLevels === 4) embed.addField('\u200b', '\u200b');
        embed.addField(`Level ${l}`, content, true);
    });
    if (shownLevels > 6) {
        embed.addField('\u200b', '\u200b');
        embed.addField(moduleStrings.leaderboardEmbed.more_level, moduleStrings.leaderboardEmbed.x_levels_are_not_shown.split('%count%').join(shownLevels - 6));
    }
    embed.addField(moduleStrings.leaderboardEmbed.your_level, moduleStrings.leaderboardEmbed.you_are_level_x_with_x_xp.split('%level%').join(user['level']).split('%xp%').join(user['xp']));
    await msg.channel.send(embed);
};

module.exports.help = {
    'name': 'leaderboard',
    'description': 'See the leaderboard of the server',
    'module': 'levels',
    'aliases': ['leaderboard', 'lb']
};
module.exports.config = {
    'restricted': false
};