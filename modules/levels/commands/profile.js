const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('./../../../main');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (client, msg) {
    const moduleStrings = require(`${confDir}/levels/strings.json`);
    let user = await client.models['levels']['User'].findOne({
        where: {
            userID: msg.author.id
        }
    });
    if (!user) return msg.channel.send(...embedType(moduleStrings['not-found']));
    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);
    const embed = new MessageEmbed()
        .setFooter(client.strings.footer)
        .setColor('GREEN')
        .setThumbnail(msg.author.avatarURL())
        .setTitle(`${moduleStrings.embed.title} ${msg.author.tag}`)
        .setDescription(moduleStrings.embed.description)
        .addField(moduleStrings.embed.messages, user.messages, true)
        .addField(moduleStrings.embed.xp, `${user.xp}/${nextLevelXp}`, true)
        .addField(moduleStrings.embed.level, user.level, true);
    await msg.channel.send(embed);

};

module.exports.help = {
    'name': 'profile',
    'description': 'Your Level-Profile',
    'module': 'levels',
    'aliases': ['p', 'profile']
};
module.exports.config = {
    'restricted': false
};