const {
    embedType,
    randomElementFromArray
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {MessageAttachment} = require('discord.js');

module.exports.run = async function (interaction) {
    const moduleConfig = interaction.client.configurations['fun']['config'];
    const user = interaction.options.getUser('user', true);
    if (user.id === interaction.user.id) return interaction.reply({
        content: localize('fun', 'no-no-not-kissing-yourself'),
        ephemeral: true
    });
    await interaction.deferReply({});
    await interaction.editReply(embedType(moduleConfig.kissMessage, {
        '%authorID%': interaction.user.id,
        '%userID%': user.id,
        '%imgUrl%': ''
    }, {files: [new MessageAttachment(randomElementFromArray(moduleConfig.kissImages))]}));
};

module.exports.config = {
    name: 'kiss',
    description: localize('fun', 'kiss-command-description'),
    options: [{
        type: 'USER',
        name: 'user',
        description: localize('fun', 'user-argument-description'),
        required: true
    }]
};