const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('./../../../main');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    const moduleStrings = require(`${confDir}/moderation/strings.json`);
    if (!msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return message.edit(...embedType(moduleStrings['no_permissions'], {
        '%required_level%': 3
    }));
    await msg.channel.bulkDelete((args[0]) ? parseInt(args[0]) : 50, true).then(m => {
        msg.channel.send(`Successfully deleted ${m.size} messages. NOTE: Messages older than 14 days can not be deleted.`);
    }).catch(() => {
        msg.channel.send('An error occurred. You can only delete 100 messages at once.');
    });
};

module.exports.help = {
    'name': 'clear',
    'description': 'Clears an channel',
    'module': 'moderation',
    'aliases': ['clear']
};
module.exports.config = {
    'restricted': false,
    'args': false
};