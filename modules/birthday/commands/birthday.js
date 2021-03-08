const {confDir} = require('../../../main');
const {generateGiveawayEmbed} = require('../birthday');
const {embedType} = require('./../../../src/functions/helpers');

module.exports.run = async function (client, msg, args) {
    const moduleConf = require(`${confDir}/birthday/config.json`);

    let user = await client.models['birthday']['User'].findOne({
        where: {
            id: msg.author.id
        }
    });

    if (args[0] === 'remove' || args[0] === 'delete') {
        if (user) user.destroy();
        await generateGiveawayEmbed(client);
        return msg.channel.send(embedType(moduleConf['successfully_changed']));
    }

    if (args[0].includes('.')) args = args[0].split('.'); // Allow users to write !birthday 23.8.2000 instead of !birthday 23 8 2000
    if (!args[1] || args[1] > 12 || args[1] <= 0 || !parseInt(args[1])) return msg.channel.send(`There is an error with your input. Please use the following format: \`${client.config.prefix}birthday <Day> <Month> [Year]\``);
    if (!args[0] || args[0] > 31 || args[0] <= 0 || !parseInt(args[0])) return msg.channel.send(`There is an error with your input. Please use the following format: \`${client.config.prefix}birthday <Day> <Month> [Year]\``);
    if (args[2] && (!parseInt(args[2]) || args[2] >= new Date().getFullYear() || args[2].length !== 4)) return msg.channel.send(`There is an error with your input. Please use full years (eg. 2021) for the year.`);

    if (user) {
        user.month = args[1];
        user.day = args[0];
        user.year = args[2];
        await user.save();
    } else {
        await client.models['birthday']['User'].create({
            id: msg.author.id,
            month: args[1],
            day: args[0],
            year: args[2]
        });
    }

    await generateGiveawayEmbed(client);
    return msg.channel.send(embedType(moduleConf['successfully_changed']));
};

module.exports.help = {
    'name': 'birthday',
    'description': 'Sets or removes your birthday',
    'module': 'giveaway',
    'aliases': ['birthday', 'bd']
};

module.exports.config = {
    'restricted': false,
    'args': true
};