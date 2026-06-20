const {localize} = require('../../../src/functions/localize');
const {ActivityType} = require('discord.js');

const activityTypes = {
    'PLAYING': ActivityType.Playing,
    'STREAMING': ActivityType.Streaming,
    'WATCHING': ActivityType.Watching,
    'COMPETING': ActivityType.Competing,
    'LISTENING': ActivityType.Listening,
    'CUSTOM': ActivityType.Custom
};

/**
 * Handle /status command to change bot status
 * @param {Interaction} interaction Discord interaction
 */
module.exports.run = async function (interaction) {
    const activityType = interaction.options.getString('activity-type');
    const botStatus = interaction.options.getString('bot-status');
    const statusText = interaction.options.getString('text');
    const streamingLink = interaction.options.getString('streaming-link');

    await interaction.client.user.setPresence({
        status: botStatus,
        activities: [{
            name: statusText,
            type: activityTypes[activityType],
            url: (activityType === 'STREAMING' && streamingLink) ? streamingLink : null
        }]
    });

    interaction.reply({
        ephemeral: true,
        content: '✅ ' + localize('betterstatus', 'status-changed', {s: statusText})
    });
};

module.exports.config = {
    name: 'status',
    description: localize('betterstatus', 'command-description'),
    defaultMemberPermissions: ['ADMINISTRATOR'],
    disabled: function (client) {
        return !client.configurations['betterstatus']['config'].enableStatusCommand;
    },
    options: [
        {
            type: 'STRING',
            name: 'text',
            required: true,
            description: localize('betterstatus', 'text-description')
        },
        {
            type: 'STRING',
            name: 'activity-type',
            required: true,
            description: localize('betterstatus', 'activity-type-description'),
            choices: [
                {name: 'Playing', value: 'PLAYING'},
                {name: 'Streaming', value: 'STREAMING'},
                {name: 'Watching', value: 'WATCHING'},
                {name: 'Competing', value: 'COMPETING'},
                {name: 'Listening', value: 'LISTENING'},
                {name: 'Custom', value: 'CUSTOM'}
            ]
        },
        {
            type: 'STRING',
            name: 'bot-status',
            required: true,
            description: localize('betterstatus', 'bot-status-description'),
            choices: [
                {name: 'Online', value: 'online'},
                {name: 'Idle', value: 'idle'},
                {name: 'Do Not Disturb', value: 'dnd'}
            ]
        },
        {
            type: 'STRING',
            name: 'streaming-link',
            required: false,
            description: localize('betterstatus', 'streaming-link-description')
        }
    ]
};