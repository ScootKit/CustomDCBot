const {embedType} = require('../functions/helpers');
exports.run = async (client, interaction) => {
    if (!client.botReadyAt) return interaction.reply({
        content: ':warning: The bot is currently starting up. Please try again in a few minutes.',
        ephemeral: true
    });
    if (!interaction.isCommand()) return;
    const command = client.commands.find(c => c.name.toLowerCase() === interaction.commandName.toLowerCase());
    if (!command) return interaction.reply({content: ':warning: Command not found', ephemeral: true});
    const group = interaction.options['_group'];
    const subCommand = interaction.options['_subcommand'];
    if (command.restricted === true && !client.config.botOperators.includes(interaction.user.id)) return interaction.reply(embedType(client.strings.not_enough_permissions));
    client.logger.debug(`${interaction.user.tag} (${interaction.user.id}) used command /${command.name}${' ' + group || ''}${' ' + subCommand || ''}.`);

    try {
        if (command.options.filter(c => c.type === 'SUB_COMMAND').length === 0) return await command.run(interaction);
        if (!command.subcommands) {
            interaction.client.logger.error(`Command ${interaction.commandName} has subcommands but does not use the subcommands handler (required).`);
            return interaction.reply({
                content: ':warning: This command is not configured correctly and can not be executed, please contact the developer.',
                ephemeral: true
            });
        }
        if (command.beforeSubcommand) await command.beforeSubcommand(interaction);
        if (group) await command.subcommands[group][subCommand](interaction);
        else await command.subcommands[subCommand](interaction);
        if (command.run) await command.run(interaction);
    } catch (e) {
        interaction.client.logger.error(`Execution of command /${command.name}${group || ''}${subCommand || ''} failed: ${e}`);
        interaction.reply({
            content: `**🔴 Command execution failed 🔴**\nThis is not intended and can have multiple reasons. Please check console output for more details.\n\n${command.module ? `This issue occurred in the "${command.module}" module developed by [${interaction.client.modules[command.module].config.author.name}](${interaction.client.modules[command.module].config.author.url}). Please report the issue to them or [open an issue](https://github.com/SCNetwork/CustomDCBot/issues/new), attach the logs and steps-to-reproduce and mention the module developer in it.` : `If you think this is a programming issue please [open an issue](https://github.com/SCNetwork/CustomDCBot/issues/new) on github with your logs and steps-to-reproduce attached.`}`,
            ephemeral: true
        }).catch(() => {
        });
    }
};