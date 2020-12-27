const {confDir} = require('./../../../main');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/admin-tools/config.json`);
    if (!args[0]) return msg.channel.send('Missing args.\n\n1. Argument: Channel-ID\n2. Argument: New Parent-ID');
    const channel = msg.guild.channels.cache.find(r => r.id === args[0]);
    if (!channel) return msg.channel.send('Channel not found');
    if (!args[1]) return msg.channel.send('Missing new parent channel id');
    if (!parseInt(args[1])) return msg.channel.send('There is a problem with the second argument.');
    if (!moduleConfig['allowed_member_ids'].includes(msg.author.id)) return msg.channel.send('You are not whitelisted to use this command.');
    await channel.setParent(args[1]).catch(msg.channel.send).then(() => msg.channel.send('Action successfully performed'));
};

module.exports.help = {
    'name': 'setcategory',
    'description': 'Set a category of a specific channel',
    'module': 'admin-tools',
    'aliases': ['setcategory']
};
module.exports.config = {
    'restricted': false
};