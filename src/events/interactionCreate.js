const {embedType} = require('../functions/helpers');
exports.run = async (client, interaction) => {
    if (!client.botReadyAt) return; // Check if bot is *really* ready
    if (!interaction.isCommand()) return;
    const command = client.commands.find(c => c.name.toLowerCase() === interaction.commandName.toLowerCase());
    if (!command) return interaction.reply({content: ':warning: Command not found', ephemeral: true});
    if (command.restricted === true && !client.config.botOperators.includes(interaction.user.id)) return interaction.reply(embedType(client.strings.not_enough_permissions));
    client.logger.debug(`${interaction.user.tag} (${interaction.user.id}) used command /${command.name}.`);
    await command.run(interaction);
};