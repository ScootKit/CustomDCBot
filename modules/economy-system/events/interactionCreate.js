const {buyShopItem} = require('../economy-system');

module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    if (interaction.guild.id !== client.config.guildID) return;
    if (!interaction.isSelectMenu()) return;
    if (interaction.customId !== 'economy-system_shop-select') return;
    await interaction.deferReply({ephemeral: true});
    buyShopItem(interaction, interaction.values[0], null);
};