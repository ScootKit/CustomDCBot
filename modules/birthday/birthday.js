const {embedType} = require('../../src/functions/helpers');
const {confDir} = require('../../main');
const {MessageEmbed} = require('discord.js');

generateGiveawayEmbed = async function (client, notifyUsers = false) {
    const moduleConf = require(`${confDir}/birthday/config.json`);
    const channel = await client.channels.fetch(moduleConf['channelID']);
    if (!channel) return console.error(`[Birthdays] Could not find channel with ID ${moduleConf['channelID']}.`);
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);

    if (notifyUsers) {
        for (const m of messages.filter(msg => msg.id !== messages.last().id).array()) {
            if (m.deletable) await m.delete(); // Removing old messages
        }
    }

    const embed = new MessageEmbed()
        .setTitle(moduleConf['birthdayEmbed']['title'])
        .setDescription(moduleConf['birthdayEmbed']['description'])
        .setTimestamp()
        .setColor(moduleConf['birthdayEmbed']['color'])
        .setAuthor(client.user.username, client.user.avatarURL())
        .setFooter(client.strings.footer)
        .addFields([
            {
                name: 'January',
                value: await getUserStringForMonth(client, channel, 1),
                inline: true
            },
            {
                name: 'February',
                value: await getUserStringForMonth(client, channel, 2),
                inline: true
            },
            {
                name: 'March',
                value: await getUserStringForMonth(client, channel, 3),
                inline: true
            },
            {
                name: 'April',
                value: await getUserStringForMonth(client, channel, 4),
                inline: true
            },
            {
                name: 'May',
                value: await getUserStringForMonth(client, channel, 5),
                inline: true
            },
            {
                name: 'June',
                value: await getUserStringForMonth(client, channel, 6),
                inline: true
            },
            {
                name: 'July',
                value: await getUserStringForMonth(client, channel, 7),
                inline: true
            },
            {
                name: 'August',
                value: await getUserStringForMonth(client, channel, 8),
                inline: true
            },
            {
                name: 'September',
                value: await getUserStringForMonth(client, channel, 9),
                inline: true
            },
            {
                name: 'October',
                value: await getUserStringForMonth(client, channel, 10),
                inline: true
            },
            {
                name: 'November',
                value: await getUserStringForMonth(client, channel, 11),
                inline: true
            },
            {
                name: 'December',
                value: await getUserStringForMonth(client, channel, 12),
                inline: true
            }
        ]);
    if (moduleConf['birthdayEmbed']['thumbnail']) embed.setThumbnail(moduleConf['birthdayEmbed']['thumbnail']);
    if (moduleConf['birthdayEmbed']['thumbnail']) embed.setThumbnail(moduleConf['birthdayEmbed']['thumbnail']);

    if (messages.last()) await messages.last().edit(embed);
    else channel.send(embed);

    if (notifyUsers) {
        const birthdayUsers = await client.models['birthday']['User'].findAll({
            where: {
                month: new Date().getMonth() + 1,
                day: new Date().getDate()
            }
        });
        if (!birthdayUsers) return;

        if (moduleConf['birthday_role']) {
            const guildMembers = await channel.guild.members.fetch();
            for (const member of guildMembers.array()) {
                if (!member) return;
                if (member.roles.cache.has(moduleConf['birthday_role'])) {
                    await member.roles.remove(moduleConf['birthday_role']);
                }
            }
        }

        for (const user of birthdayUsers) {
            const member = await channel.guild.members.fetch(user.id);
            if (!member) return;
            if (user.year) {
                channel.send(...await embedType(moduleConf['birthday_message_with_age'], {
                    '%age%': new Date().getFullYear() - user.year,
                    '%tag%': member.user.tag,
                    '%mention%': `<@${user.id}>`
                }));
            } else {
                channel.send(...await embedType(moduleConf['birthday_message'], {
                    '%tag%': member.user.tag,
                    '%mention%': `<@${user.id}>`
                }));
            }
            if (moduleConf['birthday_role']) await member.roles.add(moduleConf['birthday_role']);
        }
    }
};
module.exports.generateGiveawayEmbed = generateGiveawayEmbed;

async function getUserStringForMonth(client, channel, month) {
    const monthData = await client.models['birthday']['User'].findAll({
        where: {
            month: month
        }
    });
    monthData.sort((a, b) => {
        return a.day - b.day;
    });
    let string = '';
    for (const user of monthData) {
        await channel.guild.members.fetch(user.id).then(() => {
            string = string + `${user.day}.${month}${user.year ? `.${user.year}` : ''}: <@${user.id}>\n`;
        }).catch(() => {
        });
    }
    if (string.length === 0) string = 'No user found';
    return string;
}