const {asyncForEach} = require('../../../src/functions/helpers');
const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('./../../../main');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (client, msg, args) {
    if (!msg.member.permissions.has('ADMINISTRATOR')) return msg.channel.send('You need the permission "ADMINISTRATOR" to do this')
    if (args[0] && args[0] !== 'confirm') {
        let user = await client.models['levels']['User'].findOne({
            where: {
                userID: args[0]
            }
        });
        if (!user) return msg.channel.send(`Could not find a user with the ID ${args[0]}.`)
        if (args[1] !== 'confirm') return msg.channel.send(`Please confirm that you want to delete all data of this user. Confirm with \`${client.config.prefix}deletexp ${args[0]} confirm\``)
            user.destroy({force: true});
        return msg.channel.send(`Removed XP for the user with the ID ${args[0]}`)
    }
    if (args[0] !== 'confirm') return msg.channel.send(`Please confirm that you want to delete all data. Confirm with \`${client.config.prefix}deletexp confirm\``)
    const message = await msg.channel.send('Deleting all data... Please wait...')
    let users = await client.models['levels']['User'].findAll();
    await asyncForEach(users, async (user) => {
        await user.destroy({force: true});
    })
    message.edit(`Successfully removed ${users.length} members from the database.`)
};

module.exports.help = {
    'name': 'deletexp',
    'description': 'Deletes the XP of a user or the whole server',
    'module': 'levels',
    'aliases': ['deletexp']
};
module.exports.config = {
    'restricted': false
};