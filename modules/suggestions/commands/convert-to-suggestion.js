const {embedType} = require('../../../src/functions/helpers');
const {createSuggestion} = require('../suggestion');
const {localize} = require('../../../src/functions/localize');

module.exports.config = {
    name: 'Convert to Suggestion',
    type: 'MESSAGE',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_MESSAGES'],
    description: localize('suggestions', 'convert-to-suggestion-description')
};

module.exports.run = async function (interaction) {
    const target = interaction.targetMessage;
    await interaction.deferReply({ephemeral: true});
    const suggestionElement = await createSuggestion(interaction.guild, target.cleanContent, target.author);
    return interaction.editReply(embedType(interaction.client.configurations['suggestions']['config'].successfullySubmitted, {'%id%': suggestionElement.id}));
};
