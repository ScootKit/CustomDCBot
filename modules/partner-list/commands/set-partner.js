const {embedType} = require('../../../src/functions/helpers');
const {generatePartnerList} = require('../partnerlist');
const {confDir} = require('../../../main');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/partner-list/config.json`);
    let allowed = false;
    for (const roleID of moduleConfig['adminRoles']) {
        if (msg.member.roles.cache.get(roleID)) allowed = true;
    }
    if (!allowed) return msg.channel.send(...embedType(client.strings['not_enough_permissions']));

    const p = await client.models['partner-list']['Partner'].findOne({
        where: {
            id: args[0]
        }
    });
    if (!p) return msg.channel.send('We could not find a partner with that ID');

    switch (args[1].toLowerCase()) {
        case 'name':
            let name = '';
            await args.shift();
            await args.shift();
            args.forEach((arg) => name = name + arg + ' ');
            p.name = name;
            break;
        case 'inviteurl':
            p.invLink = args[2];
            break;
        default:
            return msg.channel.send(`Wrong usage. \`${client.config.prefix}set-partner <ID> <name/inviteUrl> <value>\``);
    }

    await p.save();
    await generatePartnerList();
    msg.channel.send('Successfully recorded changes.');
};

module.exports.help = {
    'name': 'set-partner',
    'description': 'Sets a name or the invite of a partner',
    'module': 'partner-list',
    'aliases': ['pset', 'set-partner']
};

module.exports.config = {
    'args': true,
    'restricted': false
};