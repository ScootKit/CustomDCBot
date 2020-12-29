const {embedType} = require('../functions/helpers');

exports.run = async (client, msg) => {
    if (msg.author.bot) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.content.startsWith(client.config.prefix)) return;
    const args = msg.content.split(client.config.prefix).join('').trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    if (!client.aliases.has(command)) return;
    const commandElement = client.commands.get(client.aliases.get(command));
    if (commandElement.config.restricted === true) {
        if (msg.author.id !== client.config.ownerID) return msg.channel.send(...embedType(client.strings.not_enough_permissions));
    }
    if (commandElement.config.args === true) {
        if (!args[0]) return msg.channel.send(...embedType(client.strings.need_args));
    }
    const commandFile = require(`./../../${commandElement.fileName}`);
    commandFile.run(client, msg, args);
};