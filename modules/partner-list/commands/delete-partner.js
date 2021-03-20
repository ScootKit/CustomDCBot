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
    await p.destroy();
    await generatePartnerList();
    await msg.channel.send('Successfully removed this partner from the partnerlist');
};

module.exports.help = {
    'name': 'delete-partner',
    'description': 'Removes a new partner to the partnerlist',
    'module': 'partner-list',
    'aliases': ['pdelete', 'delete-partner']
};

module.exports.config = {
    'args': true,
    'restricted': false
};