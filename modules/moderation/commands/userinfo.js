const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('./../../../main');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    const moduleStrings = require(`${confDir}/moderation/strings.json`);
    if (!msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level1'].includes(r.id) || moduleConfig['moderator-roles_level2'].includes(r.id) || moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return message.edit(message.edit(...embedType(moduleStrings['no_permissions'], {
        '%required_level%': 1
    })));
    let user;
    if (msg.mentions.members.first()) user = msg.mentions.members.first();
    else user = await msg.guild.members.fetch(args[0]).catch(() => {
    });
    if (!user) return msg.channel.send(...embedType(moduleStrings['user_not_found']));
    const actions = await client.models['moderation']['ModerationAction'].findAll({
        where: {
            victimID: user.user.id
        }
    });
    console.log(actions);
    let content = '';
    actions.forEach(action => {
        content = content + `#${action.actionID}: **${action.type}**: \`${action.reason}\` (<@${action.memberID}>) [${new Date(action.createdAt).getDate()}.${new Date(action.createdAt).getMonth()}.${new Date(action.createdAt).getFullYear()}]\n`;
    });
    if (content === '') content = `No actions against ${user.user.tag} found.`;
    const embed = new MessageEmbed()
        .setColor('GREEN')
        .setAuthor(client.user.username, client.user.avatarURL())
        .setTitle(`Information about ${user.user.tag}`)
        .setDescription(`You can find every action against ${user.user.tag} here.`)
        .setThumbnail(user.user.avatarURL())
        .setFooter(client.strings.footer)
        .addField('Actions', content)
        .addField(`Account joined`, `${user.joinedAt.getHours()}:${user.joinedAt.getMinutes()} ${user.joinedAt.getDate()}.${user.joinedAt.getMonth() + 1}.${user.joinedAt.getFullYear()}`, true)
        .addField(`Account created`, `${user.user.createdAt.getHours()}:${user.user.createdAt.getMinutes()} ${user.user.createdAt.getDate()}.${user.user.createdAt.getMonth() + 1}.${user.user.createdAt.getFullYear()}`, true);
    await msg.channel.send(embed);
};

module.exports.help = {
    'name': 'userinfo',
    'description': 'Show the interactions of a user',
    'module': 'moderation',
    'aliases': ['userinfo']
};
module.exports.config = {
    'restricted': false,
    'args': true
};