const {localize} = require('../../../src/functions/localize');
const {randomIntFromInterval, embedType, lockChannel, unlockChannel} = require('../../../src/functions/helpers');
const {startGame} = require('../guessTheNumber');

module.exports.beforeSubcommand = async function (interaction) {
    if (interaction.member.roles.cache.filter(m => interaction.client.configurations['guess-the-number']['config'].adminRoles.includes(m.id)).size === 0) return interaction.reply({
        ephemeral: true,
        content: '⚠️ To use this command, you need to be added to the adminRoles option in the SCNX-Dashboard.'
    });
    if (interaction.client.configurations['guess-the-number']['channel'].enabled && interaction.client.configurations['guess-the-number']['channel'].channel === interaction.channel.id) return interaction.reply({
        content: '⚠️ ' + localize('guess-the-number', 'gamechannel-modus'),
        ephemeral: true
    });
};

module.exports.subcommands = {
    'end': async function(interaction) {
        if (interaction.replied) return;
        const item = await interaction.client.models['guess-the-number']['Channel'].findOne({where: {channelID: interaction.channel.id, ended: false}});
        if (!item) return interaction.reply({
            content: '⚠️ ' + localize('guess-the-number', 'session-not-running'),
            ephemeral: true
        });
        await lockChannel(interaction.channel, interaction.client.configurations['guess-the-number']['config'].adminRoles, '[guess-the-number] ' + localize('guess-the-number', 'game-ended'));
        await item.destroy();
        interaction.reply({
            content: localize('guess-the-number', 'session-ended-successfully'),
            ephemeral: true
        });
    },
    'status': async function(interaction) {
        if (interaction.replied) return;
        const item = await interaction.client.models['guess-the-number']['Channel'].findOne({where: {channelID: interaction.channel.id, ended: false}});
        if (!item) return interaction.reply({
            content: '⚠️ ' + localize('guess-the-number', 'session-not-running'),
            ephemeral: true
        });
        interaction.reply({
            content: `**${localize('guess-the-number', 'current-session')}**\n\n${localize('guess-the-number', 'number')}: ${item.number}\n${localize('guess-the-number', 'min-val')}: ${item.min}\n${localize('guess-the-number', 'max-val')}: ${item.max}\n${localize('guess-the-number', 'owner')}: <@${item.ownerID}>\n${localize('guess-the-number', 'guess-count')}: ${item.guessCount}`,
            ephemeral: true,
            allowedMentions: {parse: []}
        });
    },
    'create': async function(interaction) {
        if (interaction.replied) return;
        if (await interaction.client.models['guess-the-number']['Channel'].findOne({where: {channelID: interaction.channel.id, ended: false}})) return interaction.reply({
            content: '⚠️ ' + localize('guess-the-number', 'session-already-running'),
            ephemeral: true
        });
        if (interaction.options.getInteger('min') >= interaction.options.getInteger('max')) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('guess-the-number', 'min-max-discrepancy')
        });
        const number = interaction.options.getInteger('number') || randomIntFromInterval(interaction.options.getInteger('min'), interaction.options.getInteger('max'));
        if (number > interaction.options.getInteger('max')) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('guess-the-number', 'max-discrepancy')
        });
        if (number < interaction.options.getInteger('min')) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('guess-the-number', 'min-discrepancy')
        });

        await startGame(interaction.channel, number, interaction.options.getInteger('min'), interaction.options.getInteger('max'), interaction.user.id);

        await interaction.reply({
            ephemeral: true,
            content: localize('guess-the-number', 'created-successfully', {n: number})
        });
    }
};

module.exports.config = {
    name: 'guess-the-number',
    description: localize('guess-the-number', 'command-description'),

    defaultMemberPermissions: ['MANAGE_MESSAGES'],
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'status',
            description: localize('guess-the-number', 'status-command-description')
        },
        {
            type: 'SUB_COMMAND',
            name: 'create',
            description: localize('guess-the-number', 'create-command-description'),
            options: [
                {
                    type: 'INTEGER',
                    name: 'min',
                    required: true,
                    description: localize('guess-the-number', 'create-min-description')
                },
                {
                    type: 'INTEGER',
                    name: 'max',
                    required: true,
                    description: localize('guess-the-number', 'create-max-description')
                },
                {
                    type: 'INTEGER',
                    name: 'number',
                    required: false,
                    description: localize('guess-the-number', 'create-number-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'end',
            description: localize('guess-the-number', 'end-command-description')
        }
    ]
};