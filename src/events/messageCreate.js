const {embedType} = require('../functions/helpers');

exports.run = async (client, msg) => {
    if (!client.botReadyAt) return; // Check if bot is *really* ready
    if (msg.author.bot) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.content.startsWith(client.config.prefix) && !msg.content.startsWith(`<@${client.user.id}> `) && !msg.content.startsWith(`<@!${client.user.id}> `)) return;
    let stringToReplace = client.config.prefix;
    if (!msg.content.startsWith(client.config.prefix)) stringToReplace = msg.content.startsWith(`<@${client.user.id}> `) ? `<@${client.user.id}> ` : `<@!${client.user.id}> `;
    const args = msg.content.split(stringToReplace).join('').trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    if (!client.aliases.has(command)) {
        if (!client.scnxSetup) return;
        return await require('../functions/scnx-integration').commandNotFoundCustomCommandCheck(client, msg, command, args);
    }
    const commandElement = client.messageCommands.get(client.aliases.get(command));
    if (commandElement.config.restricted === true && !client.config.botOperators.includes(msg.author.id)) return msg.reply(embedType(client.strings.not_enough_permissions));
    if ((commandElement.config.args || 0) > args.length) return msg.reply(embedType(client.strings.need_args, {
        '%count%': args.length,
        '%neededCount%': commandElement.config.args
    }));
    const commandFile = require(`./../../${commandElement.fileName}`);
    client.logger.debug(`${msg.author.tag} (${msg.author.id}) used command ${client.config.prefix}${command}.`);
    try {
        commandFile.run(client, msg, args);
    } catch (e) {
        client.logger.error(`An error executed when executing ${client.config.prefix}${command}: ${e}`);
        await msg.reply({
            content: `**🔴 Command execution failed 🔴**\nThis is not intended and can have multiple reasons. Please check console output for more details.\n\n${commandElement.module ? `This issue occurred in the "${commandElement.module}" module developed by [${msg.client.modules[commandElement.module].author.name}](${msg.client.modules[commandElement.module].author.url}). Please report the issue to them or [open an issue](https://github.com/SCNetwork/CustomDCBot/issues/new), attach the logs and steps-to-reproduce and mention the module developer in it.` : `If you think this is a programming issue please [open an issue](https://github.com/SCNetwork/CustomDCBot/issues/new) on github with your logs and steps-to-reproduce attached.`}`
        });

    }
};