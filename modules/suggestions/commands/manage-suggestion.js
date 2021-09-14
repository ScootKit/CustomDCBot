const {arrayToApplicationCommandPermissions} = require('../../../src/functions/helpers');
const {generateSuggestionEmbed, notifyMembers} = require('../suggestion');

module.exports.beforeSubcommand = async function (interaction) {
    interaction.suggestion = await interaction.client.models['suggestions']['Suggestion'].findOne({
        where: {
            id: interaction.options.getInteger('id')
        }
    });
    if (!interaction.suggestion) {
        interaction.reply({
            ephemeral: true,
            content: ':warning: Suggestion not found.'
        });
        interaction.returnEarly = true;
    } else interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    'accept': async function (interaction) {
        interaction.editType = 'approve';
    },
    'deny': async function (interaction) {
        interaction.editType = 'deny';
    }
};

module.exports.run = async function (interaction) {
    if (interaction.returnEarly) return;
    interaction.suggestion.adminAnswer = {
        action: interaction.editType,
        reason: interaction.options.getString('comment'),
        userID: interaction.user.id
    };
    await interaction.suggestion.save();
    await generateSuggestionEmbed(interaction.client, interaction.suggestion);
    await notifyMembers(interaction.client, interaction.suggestion, 'team', interaction.user.id);
    await interaction.editReply({content: 'Successfully updated suggestion'});
};

module.exports.config = {
    name: 'manage-suggestion',
    description: 'Manage suggestions as an admin',
    defaultPermission: false,
    permissions: function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['suggestions']['config'].adminRoles, 'ROLE');
    },
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'accept',
            description: 'Accepts a suggestion',
            options: [
                {
                    type: 'INTEGER',
                    name: 'id',
                    required: true,
                    description: 'ID of the suggestion'
                },
                {
                    type: 'STRING',
                    name: 'comment',
                    required: true,
                    description: 'Explain why you made this choice'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'deny',
            description: 'Denies a suggestion',
            options: [
                {
                    type: 'INTEGER',
                    name: 'id',
                    required: true,
                    description: 'ID of the suggestion'
                },
                {
                    type: 'STRING',
                    name: 'comment',
                    required: true,
                    description: 'Explain why you made this choice'
                }
            ]
        }
    ]
};