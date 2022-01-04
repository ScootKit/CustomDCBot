const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, interaction) {
    if (!interaction.client.botReadyAt) return;
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'show-level-on-liveleaderboard-click') return;
    const user = await interaction.client.models['levels']['User'].findOne({
        where: {
            userID: interaction.user.id
        }
    });
    if (!user) return interaction.reply({
        ephemeral: true,
        content: localize('levels', 'please-send-a-message')
    });
    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);
    interaction.reply({
        ephemeral: true,
        content: localize('levels', 'leaderboard-button-answer', {name: interaction.user.username, l: user.level, ux: user.xp, nx: nextLevelXp})
    });
};