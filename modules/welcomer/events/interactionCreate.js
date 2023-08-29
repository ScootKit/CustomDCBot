const {localize} = require('../../../src/functions/localize');
const {embedType, formatDiscordUserName} = require('../../../src/functions/helpers');
module.exports.run = async function (client, interaction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('welcome-')) return;
    const userID = interaction.customId.replaceAll('welcome-', '');
    if (userID === interaction.user.id) return interaction.reply({
        ephemeral: true,
        content: '👋 ' + localize('welcomer', 'welcome-yourself-error')
    });
    const channelConfig = client.configurations['welcomer']['channels'].find(c => c.channelID === interaction.channel.id);
    if (!channelConfig) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('welcomer', 'channel-not-found', {c: channelConfig.channelID})
    });
    const sendChannel = interaction.guild.channels.cache.get(channelConfig['welcome-button-channel']);
    if (!sendChannel) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('welcomer', 'channel-not-found', {c: channelConfig.sendChannel})
    });
    await interaction.update({
        components: interaction.message.components.filter(f => f.components[0].customId !== interaction.customId)
    });
    const user = await client.users.fetch(userID);
    sendChannel.send(embedType(channelConfig['welcome-button-message'], {
        '%userMention%': user.toString(),
        '%userTag%': formatDiscordUserName(user),
        '%userAvatarURL%': user.avatarURL(),
        '%clickUserMention%': interaction.user.toString(),
        '%clickUserTag%': formatDiscordUserName(interaction.user),
        '%clickUserAvatarURL%': interaction.user.avatarURL()
    }));
};