const {arrayToApplicationCommandPermissions} = require('../../../src/functions/helpers');
const {generateSuggestionEmbed, notifyMembers} = require('../suggestion');
const {localize} = require('../../../src/functions/localize');
const {autoCompleteSuggestionID} = require('./suggestion');

module.exports.beforeSubcommand = async function (interaction) {
    interaction.suggestion = await interaction.client.models['suggestions']['Suggestion'].findOne({
        where: {
            id: interaction.options.getString('id')
        }
    });
    if (!interaction.suggestion) {
        await interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('suggestions', 'suggestion-not-found')
        });
        interaction.returnEarly = true;
    } else await interaction.deferReply({ephemeral: true});
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
    await interaction.editReply({content: '✅ ' + localize('suggestions', 'updated-suggestion')});
};

module.exports.autoComplete = {
    'accept': {
        'id': autoCompleteSuggestionID
    },
    'deny': {
        'id': autoCompleteSuggestionID
    }
};


module.exports.config = {
    name: 'manage-suggestion',
    description: localize('suggestions', 'manage-suggestion-command-description'),
    defaultPermission: false,
    permissions: function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['suggestions']['config'].adminRoles, 'ROLE');
    },
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'accept',
            description: localize('suggestions', 'manage-suggestion-accept-description'),
            options: [
                {
                    type: 'STRING',
                    name: 'id',
                    required: true,
                    autocomplete: true,
                    description: localize('suggestions', 'manage-suggestion-id-description')
                },
                {
                    type: 'STRING',
                    name: 'comment',
                    required: true,
                    description: localize('suggestions', 'manage-suggestion-comment-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'deny',
            description: localize('suggestions', 'manage-suggestion-deny-description'),
            options: [
                {
                    type: 'STRING',
                    name: 'id',
                    required: true,
                    autocomplete: true,
                    description: localize('suggestions', 'manage-suggestion-id-description')
                },
                {
                    type: 'STRING',
                    name: 'comment',
                    required: true,
                    description: localize('suggestions', 'manage-suggestion-comment-description')
                }
            ]
        }
    ]
};