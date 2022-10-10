const {embedType, randomElementFromArray} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (interaction) {
    const moduleConfig = interaction.client.configurations['fun']['config'];
    const user = interaction.options.getUser('user', true);
    if (user.id === interaction.user.id) return interaction.reply({content: localize('fun', 'no-no-not-patting-yourself'), ephemeral: true});
    interaction.reply(embedType(moduleConfig.patMessage, {
        '%authorID%': interaction.user.id,
        '%userID%': user.id,
        '%imgUrl%': randomElementFromArray(moduleConfig.patImages)
    }));
};

module.exports.config = {
    name: 'pat',
    description: localize('fun', 'pat-command-description'),
    options: [
        {
            type: 'USER',
            name: 'user',
            description: localize('fun', 'user-argument-description'),
            required: true
        }
    ]
};