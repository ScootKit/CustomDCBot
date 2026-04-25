const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (client, interaction) {
    if (interaction.customId === 'gtn-leaderboard') {
        const users = await client.models['guess-the-number']['User'].findAll({
            order: [['wins', 'DESC'], ['totalGuesses', 'ASC']],
            limit: 20
        });

        if (users.length === 0) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('guess-the-number', 'leaderboard-empty')
        });

        let description = '';
        for (let i = 0; i < users.length; i++) {
            const u = users[i];
            const name = `<@${u.userID}>`;
            description += `**${i + 1}.** ${name} — 🏆 ${u.wins} ${localize('guess-the-number', 'wins')} | ${u.totalGuesses} ${localize('guess-the-number', 'guesses')}\n`;
        }

        const {MessageEmbed} = require('discord.js');
        const {parseEmbedColor} = require('../../../src/functions/helpers');
        const embed = new MessageEmbed()
            .setTitle('🏆 ' + localize('guess-the-number', 'leaderboard-title'))
            .setDescription(description)
            .setColor(parseEmbedColor('GOLD'));

        return interaction.reply({
            ephemeral: true,
            embeds: [embed]
        });
    }
    if (interaction.customId === 'gtn-reaction-meaning') return interaction.reply({
        ephemeral: true,
        content: `## ${localize('guess-the-number', 'emoji-guide-button')}\n* :x:: ${localize('guess-the-number', 'guide-wrong-guess')}\n* :white_check_mark:: ${localize('guess-the-number', 'guide-win')}\n* :no_entry_sign:: ${localize('guess-the-number', 'guide-invalid-guess')}\n* :no_entry:: ${localize('guess-the-number', 'guide-admin-guess')}`
    });
};