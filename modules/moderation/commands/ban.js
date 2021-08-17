const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('./../../../main');
const {moderationAction} = require('../moderationActions');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    const moduleStrings = require(`${confDir}/moderation/strings.json`);
    const message = await msg.channel.send('One sec...');
    if (!msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level4'].includes(r.id))) return message.edit(...embedType(moduleStrings['no_permissions'], {
        '%required_level%': 4
    }));
    let user;
    if (msg.mentions.members.first()) user = msg.mentions.members.first();
    else user = await msg.guild.members.fetch(args[0]).catch(() => {
    });
    if (!user) user = {notFound: true, id: args[0]};
    let reason = '';
    await args.shift(); // Removing tag/userid from arguments
    args.forEach(a => {
        reason = reason + ' ' + a;
    });
    if (reason.length === 0 && moduleConfig['require_reason']) return message.edit(...embedType(moduleStrings['missing_reason']));
    if (!user.notFound && user.roles.cache.find(r => moduleConfig['moderator-roles_level4'].includes(r.id))) return message.edit(...embedType(moduleStrings['this_is_a_mod']));
    moderationAction(client, 'ban', msg.member, user, reason).then(m => {
        if (m) {
            message.edit(`Done. Case-ID: #${m.actionID}`);
        } else message.edit('An error occurred');
    });
};

module.exports.help = {
    'name': 'ban',
    'description': 'Bans a member',
    'module': 'moderation',
    'aliases': ['ban']
};
module.exports.config = {
    'restricted': false,
    'args': true
};