const {localize} = require('../../../src/functions/localize');
const {embedType, formatNumber} = require('../../../src/functions/helpers');
const {calculateLevelXP, displayLevel, isMaxLevel} = require('./messageCreate');

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
    const nextLevelXp = calculateLevelXP(client, user.level + 1);
    interaction.reply(embedType(client.configurations['levels']['strings']['leaderboard-button-answer'], {
        '%name%': interaction.user.username,
        '%level%': displayLevel(user.level, client),
        '%userXP%': formatNumber(isMaxLevel(user.level, client) ? calculateLevelXP(client, client.configurations['levels']['config'].maximumLevel - 1) : user.xp),
        '%nextLevelXP%': isMaxLevel(user.level, client) ? '∞' : formatNumber(nextLevelXp)
    }, {ephemeral: true}));
};