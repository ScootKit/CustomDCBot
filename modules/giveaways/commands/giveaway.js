const {arrayToApplicationCommandPermissions, formatDate} = require('../../../src/functions/helpers');
const {createGiveaway, endGiveaway} = require('../giveaways');
const durationParser = require('parse-duration');

module.exports.subcommands = {
    'start': async function (interaction) {
        if (interaction.options.getString('duration') === 0) return interaction.reply({
            ephemeral: true,
            content: '⚠ Duration-Parsing failed.'
        });
        if (interaction.options.getChannel('channel').type !== 'GUILD_TEXT' && interaction.options.getChannel('channel').type !== 'GUILD_NEWS') return interaction.reply({
            ephemeral: true,
            content: '⚠ Channel-Type not supported'
        });
        if (interaction.options.getInteger('winner-count') < 1 || interaction.options.getString('prize').length < 2) return interaction.reply({
            ephemeral: true,
            content: '⚠ Parsing of parameters failed'
        });
        const requirements = [];
        if (interaction.options.getInteger('required-messages')) requirements.push({
            type: 'messages',
            messageCount: interaction.options.getInteger('required-messages')
        });
        if (interaction.options.getRole('required-role')) requirements.push(({
            type: 'roles',
            roles: [interaction.options.getRole('required-role').id]
        }));
        await createGiveaway(interaction.options.getUser('sponsor') || interaction.user, interaction.options.getChannel('channel'), interaction.options.getString('prize'), new Date(durationParser(interaction.options.getString('duration') + new Date().getTime())), interaction.options.getInteger('winner-count'), requirements, interaction.options.getString('sponsorlink'));
        interaction.reply({
            ephemeral: true,
            content: `Started giveaway successfully in ${interaction.options.getChannel('channel').toString()}.`
        });
    },
    'reroll': async function (interaction) {
        const giveaway = await interaction.client.models['giveaways']['Giveaway'].findOne({
            where: {messageID: interaction.options.getString('msg-id', true)}
        });
        if (!giveaway) return interaction.reply({
            ephemeral: true,
            content: '⚠ Giveaway not found'
        });
        await endGiveaway(giveaway.id, null, false, interaction.options.getInteger('winner-count'));
        await interaction.reply({
            ephemeral: true,
            content: ':+1: Done'
        });
    },
    'end': async function (interaction) {
        const giveaways = await interaction.client.models['giveaways']['Giveaway'].findAll({
            where: {
                ended: false
            },
            order: [['createdAt', 'DESC']],
            max: 15
        });
        const selectMenuOptions = [];
        for (const giveaway of giveaways) {
            const c = interaction.channel.guild.channels.cache.get(giveaway.channelID);
            if (!c) continue;
            selectMenuOptions.push({
                value: giveaway.id.toString(),
                label: giveaway.prize,
                description: `Will end in #${c.name} on ${formatDate(new Date(parseInt(giveaway.endAt)))}`
            });
        }
        if (selectMenuOptions.length === 0) return interaction.reply({
            ephemeral: true,
            content: '⚠ They are no currently running giveaways. Maybe you are looking for /reroll?'
        });
        await interaction.reply({
            ephemeral: true,
            content: 'Please select the giveaway which you want to end.',
            components: [{
                type: 'ACTION_ROW',
                components: [{
                    type: 'SELECT_MENU',
                    customId: 'end-giveaway',
                    placeholder: 'Please select',
                    maxValues: 1,
                    minValues: 1,
                    options: selectMenuOptions
                }]
            }]
        });
    }
};

module.exports.config = {
    name: 'gmanage',
    description: 'Manage giveaways',
    defaultPermission: false,
    permissions: function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['giveaways']['config']['allowed_roles'], 'ROLE');
    },
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'start',
            description: 'Start a new giveaway',
            options: [
                {
                    type: 'CHANNEL',
                    name: 'channel',
                    required: true,
                    description: 'Channel to start the giveaway in'
                },
                {
                    type: 'STRING',
                    name: 'prize',
                    required: true,
                    description: 'Price that can be won'
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: true,
                    description: 'Duration of the giveaway (e.g: "2h 40m" or "7d 2h 3m")'
                },
                {
                    type: 'INTEGER',
                    name: 'winner-count',
                    required: true,
                    description: 'Count of winners that should be selected'
                },
                {
                    type: 'INTEGER',
                    name: 'required-messages',
                    required: false,
                    description: 'Count of new (!) messages that a user needs to have before entering'
                },
                {
                    type: 'ROLE',
                    name: 'required-role',
                    required: false,
                    description: 'Role that user need to have to enter the giveaway'
                },
                {
                    type: 'USER',
                    name: 'sponsor',
                    required: false,
                    description: 'Sets a different giveaway-starter, useful if you have a sponsor'
                },
                {
                    type: 'STRING',
                    name: 'sponsorlink',
                    required: false,
                    description: 'Link to a sponsor if applicable'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'end',
            description: 'Ends a giveaway'
        },
        {
            type: 'SUB_COMMAND',
            name: 'reroll',
            description: 'Rerolls an ended giveaway',
            options: [
                {
                    type: 'STRING',
                    name: 'msg-id',
                    required: true,
                    description: 'Message-ID of the giveaway '
                },
                {
                    type: 'INTEGER',
                    name: 'winner-count',
                    required: false,
                    description: 'How many new winners there should be'
                }
            ]
        }
    ]
};