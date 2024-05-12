const {localize} = require('../../../src/functions/localize');
const {embedType, formatNumber} = require('../../../src/functions/helpers');

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
    interaction.reply(embedType(client.configurations['levels']['strings']['leaderboard-button-answer'], {
        '%name%': interaction.user.username,
        '%level%': user.level,
        '%userXP%': formatNumber(user.xp),
        '%nextLevelXP%': formatNumber(nextLevelXp)
    }, {ephemeral: true}));
};