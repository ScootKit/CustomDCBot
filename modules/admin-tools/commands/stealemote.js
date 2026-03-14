const {localize} = require('../../../src/functions/localize');
const {formatDiscordUserName} = require('../../../src/functions/helpers');

module.exports.run = async function (interaction) {
    const content = interaction.options.getString('emote', true);
    let emote = content.replace('<', '').replace('>', '');
    emote = emote.split(':');
    if (!emote[2] || !emote[1]) return interaction.reply({
        content: '⚠️ ' + localize('admin-tools', 'emoji-too-much-data'),
        ephemeral: true
    });
    emote = await interaction.guild.emojis.create({
        attachment: `https://cdn.discordapp.com/emojis/${emote[2]}`,
        name: emote[1],
        reason: `Emoji imported by ${formatDiscordUserName(interaction.user)}`
    });
    await interaction.reply({
        content: localize('admin-tools', 'emoji-import', {e: emote.toString()}),
        ephemeral: true
    });
};

module.exports.config = {
    name: 'stealemote',
    defaultMemberPermissions: ['MANAGE_EMOJIS_AND_STICKERS'],
    description: localize('admin-tools', 'stealemote-description'),

    options: [
        {
            type: 'STRING',
            name: 'emote',
            description: localize('admin-tools', 'emote-description'),
            required: true
        }
    ]
};