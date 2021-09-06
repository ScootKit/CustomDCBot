const {arrayToApplicationCommandPermissions} = require('../../../src/functions/helpers');

module.exports.run = async function (interaction) {
    const content = interaction.options.getString('emote', true);
    let emote = content.replace('<', '').replace('>', '');
    emote = emote.split(':');
    if (!emote[2] || !emote[1]) return interaction.reply({
        content: ':warning: Please **only** enter one emoji and nothing else',
        ephemeral: true
    });
    emote = await interaction.guild.emojis.create(`https://cdn.discordapp.com/emojis/${emote[2]}`, emote[1], {reason: `Emoji imported by ${interaction.user.tag}`});
    await interaction.reply({
        content: `Imported "${emote.toString()}" successfully.`,
        ephemeral: true
    });
};

module.exports.config = {
    name: 'stealemote',
    description: 'Steals a emote from another server',
    defaultPermission: false,
    permissions: async function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['admin-tools']['config']['stealemote_allowed_role_ids'], 'USER');
    },
    options: [
        {
            type: 'STRING',
            name: 'emote',
            description: 'Emote to steal',
            required: true
        }
    ]
};