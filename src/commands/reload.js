const {reloadConfig} = require('../functions/configuration');
const {syncCommandsIfNeeded} = require('../../main');
const {localize} = require('../functions/localize');

module.exports.run = async function (interaction) {
    await interaction.reply({
        ephemeral: true,
        content: localize('reload', 'reloading-config')
    });
    if (interaction.client.logChannel) interaction.client.logChannel.send('🔄 ' + localize('reload', 'reloading-config-with-name', {tag: interaction.user.tag}));
    await reloadConfig(interaction.client).catch((async reason => {
        if (interaction.client.logChannel) interaction.client.logChannel.send('⚠️ ' + localize('reload', 'reload-failed'));
        await interaction.editReply({content: localize('reload', 'reload-failed-message', {reason})});
        process.exit(1);
    })).then(async () => {
        if (interaction.client.logChannel) interaction.client.logChannel.send('✅ ' + localize('reload', 'reloaded-config'));
        await interaction.editReply(localize('reload', 'reload-successful-syncing-commands'));
        await syncCommandsIfNeeded();
        await interaction.editReply(localize('reload', 'reloaded-config'));
    });
};

module.exports.config = {
    name: 'reload',
    description: localize('reload', 'command-description'),
    restricted: true
};