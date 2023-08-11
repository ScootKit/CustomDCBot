const {embedType} = require('../../../src/functions/helpers');
const {createSuggestion} = require('../suggestion');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    const suggestionElement = await createSuggestion(interaction.guild, interaction.options.getString('suggestion'), interaction.user);
    await interaction.editReply(embedType(interaction.client.configurations['suggestions']['config'].successfullySubmitted, {'%id%': suggestionElement.id}));
};

module.exports.config = {
    name: 'suggestion',
    description: localize('suggestions', 'suggest-description'),
    options: [{
        type: 'STRING',
        required: true,
        name: 'suggestion',
        description: localize('suggestions', 'suggest-content')
    }]
};