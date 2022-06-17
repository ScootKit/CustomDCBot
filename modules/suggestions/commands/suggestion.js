const {embedType} = require('../../../src/functions/helpers');
const {generateSuggestionEmbed} = require('../suggestion');

module.exports.run = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    const moduleConfig = interaction.client.configurations['suggestions']['config'];
    const channel = interaction.guild.channels.cache.get(moduleConfig.suggestionChannel);
    const suggestionMsg = await channel.send(moduleConfig.notifyRole ? `<@&${moduleConfig.notifyRole}> New suggestion, loading..` : 'Loading...');
    if (moduleConfig.allowUserComment) await suggestionMsg.startThread({name: moduleConfig.threadName});
    if (moduleConfig.reactions) moduleConfig.reactions.forEach(reaction => suggestionMsg.react(reaction));
    const suggestionElement = await interaction.client.models['suggestions']['Suggestion'].create({
        suggestion: interaction.options.getString('suggestion'),
        messageID: suggestionMsg.id,
        suggesterID: interaction.user.id,
        comments: []
    });
    await generateSuggestionEmbed(interaction.client, suggestionElement);
    await interaction.editReply(embedType(moduleConfig.successfullySubmitted, {'%id%': suggestionElement.id}));
};

module.exports.config = {
    name: 'suggestion',
    description: 'Create and comment on suggestions',
    options: [{
        type: 'STRING',
        required: true,
        name: 'suggestion',
        description: 'Content you want to suggest'
    }]
};