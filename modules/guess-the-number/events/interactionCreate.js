const {localize} = require('../../../src/functions/localize');
module.exports.run = async function (client, interaction) {
    if (interaction.customId === 'gtn-reaction-meaning') return interaction.reply({
        ephemeral: true,
        content: `## ${localize('guess-the-number', 'emoji-guide-button')}\n* :x:: ${localize('guess-the-number', 'guide-wrong-guess')}\n* :white_check_mark:: ${localize('guess-the-number', 'guide-win')}\n* :no_entry_sign:: ${localize('guess-the-number', 'guide-invalid-guess')}\n* :no_entry:: ${localize('guess-the-number', 'guide-admin-guess')}`
    });
};