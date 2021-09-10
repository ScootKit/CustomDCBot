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
        content: 'Please send some messages before I can show you some data'
    });
    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);
    interaction.reply({
        ephemeral: true,
        content: `Hi, ${interaction.user.username}, you are currently on **Level ${user.level}** with **${user.xp}**/${nextLevelXp} **XP**. Learn more with \`/profile\`.`
    });
};