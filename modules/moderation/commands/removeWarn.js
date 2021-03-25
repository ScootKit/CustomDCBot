const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('./../../../main');
const {MessageEmbed} = require('discord.js');
const {moderationAction} = require('../moderationActions');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    const moduleStrings = require(`${confDir}/moderation/strings.json`);
    const message = await msg.channel.send('One sec...');
    if (!msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level1'].includes(r.id) || moduleConfig['moderator-roles_level2'].includes(r.id) || moduleConfig['moderator-roles_level3'].includes(r.id) || moduleConfig['moderator-roles_level4'].includes(r.id))) return message.edit(message.edit(...embedType(moduleStrings['no_permissions'], {
        '%required_level%': 1
    })));
    const warn = await client.models['moderation']['ModerationAction'].findOne({
        where: {
            actionID: args[0]
        }
    });
    if (!warn) return await message.edit('Warn not found');
    let reason = '';
    await args.shift(); // Removing warnID
    args.forEach(a => {
        reason = reason + ' ' + a;
    });
    if (reason.length === 0 && moduleConfig['require_reason']) return message.edit(...embedType(moduleStrings['missing_reason']));
    moderationAction(client, 'unwarn', msg.member, {
        id: warn.victimID,
        user: {id: warn.victimID, tag: 'Unknown'}
    }, reason).then(async m => {
        if (m) {
            await warn.destroy();
            await message.edit(`Done. Case-ID: #${m.actionID}`);
        } else await message.edit('An error occurred');
    });
};

module.exports.help = {
    'name': 'removewarn',
    'description': 'Removes a warn from a member',
    'module': 'moderation',
    'aliases': ['removewarn']
};
module.exports.config = {
    'restricted': false,
    'args': true
};