const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('./../../../main');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (client, msg, args) {
    const moduleStrings = require(`${confDir}/levels/strings.json`);

    let member = msg.member;
    if (args[0]) {
        if (msg.mentions.members.first()) member = msg.mentions.members.first();
        else member = await (await msg.guild.members.fetch(args[0]));
        if (!member) return message.edit(...embedType(moduleStrings['user_not_found']));
    }
    const user = await client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) return msg.channel.send(...embedType(moduleStrings['not-found']));
    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);
    const embed = new MessageEmbed()
        .setFooter(client.strings.footer)
        .setColor('GREEN')
        .setThumbnail(member.user.avatarURL())
        .setTitle(`${moduleStrings.embed.title} ${member.user.tag}`)
        .setDescription(moduleStrings.embed.description)
        .addField(moduleStrings.embed.messages, user.messages, true)
        .addField(moduleStrings.embed.xp, `${user.xp}/${nextLevelXp}`, true)
        .addField(moduleStrings.embed.level, user.level, true)
        .addField(moduleStrings.embed.joinedAt, `${member.joinedAt.getHours()}:${member.joinedAt.getMinutes()} ${member.joinedAt.getDate()}.${member.joinedAt.getMonth() + 1}.${member.joinedAt.getFullYear()}`, true);
    await msg.channel.send(embed);
};

module.exports.help = {
    'name': 'profile',
    'description': 'Shows the Level-Profile of you or another user',
    'module': 'levels',
    'aliases': ['p', 'profile']
};
module.exports.config = {
    'restricted': false
};