const {endGiveaway} = require('../giveaways');
const {confDir} = require('../../../main');
const {embedType} = require('./../../../src/functions/helpers');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/giveaways/config.json`);
    let allowed = false;
    for (const roleID of moduleConfig['allowed_roles']) {
        if (msg.member.roles.cache.get(roleID)) allowed = true;
    }
    if (!allowed) return msg.channel.send(...embedType(client.strings['not_enough_permissions']));

    const giveaway = await client.models['giveaways']['Giveaway'].findOne({
        where: {
            messageID: args[0]
        }
    });
    if (!giveaway) return msg.channel.send('Giveaway not found.');

    await endGiveaway(giveaway.id);

    msg.channel.send('Done :smile:');
};

module.exports.help = {
    'name': 'gend',
    'description': 'Ends a giveaway or rerolls it',
    'module': 'giveaway',
    'aliases': ['gend', 'gereroll']
};

module.exports.config = {
    'restricted': false,
    'args': true
};