const {confDir} = require('./../../../main');
const {MessageEmbed} = require('discord.js');
const {moderationAction} = require('../moderationActions');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    const moduleStrings = require(`${confDir}/moderation/strings.json`);
    const message = await msg.channel.send('One sec...');
    if (!msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level2'].includes(r.id) || moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return message.edit(moduleStrings['no_permissions'].split('%required_level%').join(2));
    let user;
    if (msg.mentions.members.first()) user = msg.mentions.members.first();
    else user = await msg.guild.members.fetch(args[0]).catch(() => {
        return message.edit(moduleStrings['user_not_found']);
    });
    if (!user) return message.edit(moduleStrings['user_not_found']);
    let reason = '';
    await args.shift(); // Removing tag/userid from arguments
    args.forEach(a => {
        reason = reason + ' ' + a;
    });
    if (user.roles.cache.find(r => moduleConfig['moderator-roles_level2'].includes(r.id) || moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return message.edit(moduleStrings['this_is_a_mod']);
    if (user.roles.cache.find(r => moduleConfig['moderator-roles'].includes(r.id))) return message.edit(moduleStrings['this_is_a_mod']);
    moderationAction(client, 'mute', msg.member, user, reason).then(m => {
        if (m) {
            message.edit(`Done. Case-ID: #${m.actionID}`);
        } else message.edit('An error occured');
    });
};

module.exports.help = {
    'name': 'mute',
    'description': 'Mute an member',
    'module': 'moderation',
    'aliases': ['mute']
};
module.exports.config = {
    'restricted': false,
    'args': true
};