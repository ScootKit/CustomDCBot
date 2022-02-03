const {embedType, truncate} = require('../../../src/functions/helpers');
const {generateSuggestionEmbed, notifyMembers} = require('../suggestion');
const {localize} = require('../../../src/functions/localize');

module.exports.subcommands = {
    'create': async function (interaction) {
        await interaction.deferReply({ephemeral: true});
        const moduleConfig = interaction.client.configurations['suggestions']['config'];
        const channel = await interaction.guild.channels.fetch(moduleConfig.suggestionChannel);
        const suggestionMsg = await channel.send(moduleConfig.notifyRole ? `<@&${moduleConfig.notifyRole}> New suggestion, loading..` : 'Loading...');
        if (moduleConfig.commentType === 'thread') await suggestionMsg.startThread({name: moduleConfig.threadName});
        if (moduleConfig.reactions) moduleConfig.reactions.forEach(reaction => suggestionMsg.react(reaction));
        const suggestionElement = await interaction.client.models['suggestions']['Suggestion'].create({
            suggestion: interaction.options.getString('suggestion'),
            messageID: suggestionMsg.id,
            suggesterID: interaction.user.id,
            comments: []
        });
        await generateSuggestionEmbed(interaction.client, suggestionElement);
        await interaction.editReply(embedType(moduleConfig.successfullySubmitted, {'%id%': suggestionElement.id}));
    },
    'comment': async function (interaction) {
        const suggestionElement = await interaction.client.models['suggestions']['Suggestion'].findOne({
            where: {
                id: interaction.options.getString('id')
            }
        });
        if (!suggestionElement) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('suggestions', 'suggestion-not-found')
        });
        await interaction.deferReply({ephemeral: true});
        suggestionElement.comments.push({
            comment: interaction.options.getString('comment'),
            userID: interaction.user.id
        });
        const realarray = suggestionElement.comments;
        suggestionElement.comments = null;
        suggestionElement.comments = realarray; // Thanks sequelize wtf
        await suggestionElement.save();
        await generateSuggestionEmbed(interaction.client, suggestionElement);
        await notifyMembers(interaction.client, suggestionElement, 'comment', interaction.user.id);
        await interaction.editReply({
            content: ':+1: Successfully commented'
        });
    }
};

module.exports.autoComplete = {
    'comment': {
        'id': autoCompleteSuggestionID
    }
};

/**
 * Auto-Completes a suggestion id
 * @param {Interaction} interaction Interaction to auto-complete up on
 * @return {Promise<void>}
 */
async function autoCompleteSuggestionID(interaction) {
    const suggestions = await interaction.client.models['suggestions']['Suggestion'].findAll();
    const returnValue = [];
    interaction.value = interaction.value.toLowerCase();
    for (const suggestion of suggestions.filter(s => (interaction.client.guild.members.cache.get(s.suggesterID) || {user: {tag: s.suggesterID}}).user.tag.toLowerCase().includes(interaction.value) || s.suggestion.toLowerCase().includes(interaction.value) || s.id.toString().includes(interaction.value) || s.messageID.includes(interaction.value))) {
        if (returnValue.length !== 25) returnValue.push({
            value: suggestion.id.toString(),
            name: truncate(`${(interaction.client.guild.members.cache.get(suggestion.suggesterID) || {user: {tag: suggestion.suggesterID}}).user.tag}: ${suggestion.suggestion}`, 100)
        });
    }
    interaction.respond(returnValue);
}
module.exports.autoCompleteSuggestionID = autoCompleteSuggestionID;

module.exports.config = {
    name: 'suggestion',
    description: 'Create and comment on suggestions',
    options: function (client) {
        const array = [{
            type: 'SUB_COMMAND',
            name: 'create',
            description: 'Create a new suggestion',
            options: [{
                type: 'STRING',
                required: true,
                name: 'suggestion',
                description: 'Content you want to suggest'
            }]
        }];
        if (client.configurations['suggestions']['config'].commentType === 'command') {
            array.push(
                {
                    type: 'SUB_COMMAND',
                    name: 'comment',
                    description: 'Comments on a suggestion',
                    options: [
                        {
                            type: 'STRING',
                            required: true,
                            name: 'id',
                            autocomplete: true,
                            description: 'ID of the suggestion'
                        },
                        {
                            type: 'STRING',
                            required: true,
                            name: 'comment',
                            description: 'Your important comment'
                        }
                    ]
                });
        }
        return array;
    }
};