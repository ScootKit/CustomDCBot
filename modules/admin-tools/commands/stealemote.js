const {arrayToApplicationCommandPermissions} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (interaction) {
    const content = interaction.options.getString('emote', true);
    let emote = content.replace('<', '').replace('>', '');
    emote = emote.split(':');
    if (!emote[2] || !emote[1]) return interaction.reply({
        content: ':warning: ' + localize('admin-tools', 'emoji-too-much-data'),
        ephemeral: true
    });
    emote = await interaction.guild.emojis.create(`https://cdn.discordapp.com/emojis/${emote[2]}`, emote[1], {reason: `Emoji imported by ${interaction.user.tag}`});
    await interaction.reply({
        content: localize('admin-tools', 'emoji-import', {e: emote.toString()}),
        ephemeral: true
    });
};

module.exports.config = {
    name: 'stealemote',
    description: localize('admin-tools', 'stealemote-description'),
    defaultPermission: false,
    permissions: async function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['admin-tools']['config']['stealemote_allowed_role_ids'], 'USER');
    },
    options: [
        {
            type: 'STRING',
            name: 'emote',
            description: localize('admin-tools', 'emote-description'),
            required: true
        }
    ]
};