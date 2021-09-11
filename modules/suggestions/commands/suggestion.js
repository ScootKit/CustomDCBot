const {embedType} = require('../../../src/functions/helpers');
const {generateSuggestionEmbed, notifyMembers} = require('../suggestion');

module.exports.subcommands = {
    'create': async function (interaction) {
        await interaction.deferReply({ephemeral: true});
        const moduleConfig = interaction.client.configurations['suggestions']['config'];
        const channel = await interaction.guild.channels.fetch(moduleConfig.suggestionChannel);
        const suggestionMsg = await channel.send(moduleConfig.notifyRole ? `<@&${moduleConfig.notifyRole}> New suggestion, loading..` : 'Loading...');
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
                id: interaction.options.getInteger('id')
            }
        });
        if (!suggestionElement) return interaction.reply({
            ephemeral: true,
            content: 'Suggestion could not be found'
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
        if (client.configurations['suggestions']['config'].allowUserComment) {
            array.push(
                {
                    type: 'SUB_COMMAND',
                    name: 'comment',
                    description: 'Comments on a suggestion',
                    options: [
                        {
                            type: 'INTEGER',
                            required: true,
                            name: 'id',
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