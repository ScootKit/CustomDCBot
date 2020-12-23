const { confDir } = require('./../../../main');

module.exports.run = async function(client, msg, args) {
	const moduleConfig = require(`${confDir}/admin-tools/config.json`);
	if (!args[0]) return msg.channel.send('Missing args.\n\n1. Argument: Channel-ID\n2. Argument: New Position (optional - if not set returning current position)');
	const channel = msg.guild.channels.cache.find(r => r.id === args[0]);
	if (!channel) return msg.channel.send('Channel not found');
	if (!args[1]) return msg.channel.send(`Current position: ${channel.rawPosition}`);
	if (!parseInt(args[1]) && args[1] !== '0') return msg.channel.send('There is a problem with the second argument.');
	if (!moduleConfig['allowed_member_ids'].includes(msg.author.id)) return msg.channel.send('You are not whitelisted to use this command.');
	await channel.setPosition(parseInt(args[1])).catch(msg.channel.send).then((updated) => msg.channel.send(`New Position: ${updated.position}`));

};

module.exports.help = {
	'name': 'movechannel',
	'description': 'Move a channel with a command',
	'module': 'admin-tools',
	'aliases': ['movechannel'],
};
module.exports.config = {
	'restricted': false,
};