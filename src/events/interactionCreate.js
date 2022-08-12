const {embedType} = require('../functions/helpers');
const {localize} = require('../functions/localize');

module.exports.run = async (client, interaction) => {
    if (!client.botReadyAt) {
        if (interaction.isAutocomplete()) return interaction.respond({});
        return interaction.reply({
            content: '⚠ ' + localize('command', 'startup'),
            ephemeral: true
        });
    }
    if (client.guild.id !== interaction.guild.id) {
        if (interaction.isAutocomplete()) return interaction.respond({});
        return interaction.reply({
            content: '⚠ ' + localize('command', 'wrong-guild', {g: client.guild.name}),
            ephemeral: true
        });
    }
    if ((interaction.customId || '').startsWith('cc-') && client.scnxSetup) return require('../functions/scnx-integration').customCommandInteractionClick(interaction);
    if (interaction.isSelectMenu() && interaction.customId === 'select-roles' && client.scnxSetup) return require('../functions/scnx-integration').handleSelectRoles(client, interaction);
    if (interaction.isButton() && interaction.customId.startsWith('srb-') && client.scnxSetup) return require('../functions/scnx-integration').handleRoleButton(client, interaction);
    if (!interaction.commandName) return;
    const command = client.commands.find(c => c.name.toLowerCase() === interaction.commandName.toLowerCase());
    if (!command) {
        if (client.scnxSetup) return require('./../functions/scnx-integration').customCommandSlashInteraction(interaction);
        else return interaction.reply({content: '⚠ ' + localize('command', 'not-found'), ephemeral: true});
    }
    if (command.module && !client.modules[command.module].enabled) return interaction.reply({
        ephemeral: true,
        content: '⚠ ' + localize('command', 'module-disabled', {m: module})
    });
    if (command && typeof (command || {}).options === 'function') command.options = await command.options(interaction.client);
    const group = interaction.options['_group'];
    const subCommand = interaction.options['_subcommand'];
    if (interaction.isAutocomplete()) {
        let focusedOption = interaction.options['_hoistedOptions'].find(h => h.focused);
        interaction.value = (focusedOption || {}).value;
        focusedOption = (focusedOption || {}).name;
        if (!focusedOption) return interaction.respond({});
        try {
            if (!command) return interaction.respond({});
            if (command.options.filter(c => c.type === 'SUB_COMMAND').length === 0) return await command.autoComplete[focusedOption](interaction);
            if (group) return await command.autoComplete[group][subCommand][focusedOption](interaction);
            else return await command.autoComplete[subCommand][focusedOption](interaction);
        } catch (e) {
            if (client.captureException) client.captureException(e, {
                command: command.name,
                module: command.module,
                group,
                subCommand,
                focusedOption,
                userID: interaction.user.id
            });
            interaction.client.logger.error(localize('command', 'autcomplete-execution-failed', {
                e,
                f: focusedOption,
                c: command.name,
                g: group || '',
                s: subCommand || ''
            }));
            interaction.respond({});
        }
    }
    if (!interaction.isCommand()) return;
    if (command.restricted === true && !client.config.botOperators.includes(interaction.user.id)) return interaction.reply(embedType(client.strings.not_enough_permissions));
    client.logger.debug(localize('command', 'used', {
        tag: interaction.user.tag,
        id: interaction.user.id,
        c: command.name,
        g: group || '',
        s: subCommand || ''
    }));

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
        if (client.captureException) client.captureException(e, {
            command: command.name,
            module: command.module,
            group,
            subCommand,
            userID: interaction.user.id
        });
        interaction.client.logger.error(localize('command', 'execution-failed', {
            e,
            c: command.name,
            g: group || '',
            s: subCommand || ''
        }));
        if (!interaction.deferred) {
            interaction.reply({
                content: localize('command', 'execution-failed-message'),
                ephemeral: true
            }).catch(() => {
            });
        } else await interaction.editReply(localize('command', 'execution-failed-message')).catch(() => {
        });
    }
};