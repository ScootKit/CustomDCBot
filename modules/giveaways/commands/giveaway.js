const {arrayToApplicationCommandPermissions, truncate} = require('../../../src/functions/helpers');
const {createGiveaway, endGiveaway} = require('../giveaways');
const durationParser = require('parse-duration');
const {localize} = require('../../../src/functions/localize');

module.exports.subcommands = {
    'start': async function (interaction) {
        if (interaction.options.getString('duration') === 0) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('giveaways', 'duration-parsing-failed')
        });
        if (interaction.options.getChannel('channel').type !== 'GUILD_TEXT' && interaction.options.getChannel('channel').type !== 'GUILD_NEWS') return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('giveaways', 'duration-parsing-failed')
        });
        if (interaction.options.getInteger('winner-count') < 1 || interaction.options.getString('prize').length < 2) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('giveaways', 'parameter-parsing-failed')
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
            content: localize('giveaways', 'started-successfully', {c: interaction.options.getChannel('channel').toString()})
        });
    },
    'reroll': async function (interaction) {
        const giveaway = await interaction.client.models['giveaways']['Giveaway'].findOne({
            where: {messageID: interaction.options.getString('msg-id', true)}
        });
        if (!giveaway) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('giveaways', 'no-giveaways-found')
        });
        await endGiveaway(giveaway.id, null, false, interaction.options.getInteger('winner-count'));
        await interaction.reply({
            ephemeral: true,
            content: localize('giveaways', 'reroll-done')
        });
    },
    'end': async function (interaction) {
        const giveaway = await interaction.client.models['giveaways']['Giveaway'].findOne({
            where: {messageID: interaction.options.getString('msg-id', true)}
        });
        if (!giveaway) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('giveaways', 'no-giveaways-found')
        });
        await endGiveaway(giveaway.id, null, true);
        await interaction.reply({
            ephemeral: true,
            content: localize('giveaways', 'giveaway-ended-successfully')
        });
    }
};

module.exports.autoComplete = {
    'end': {
        'msg-id': autoCompleteMsgID
    },
    'reroll': {
        'msg-id': autoCompleteMsgID
    }
};

/**
 * @private
 * Runs auto complete on the msg-id option
 * @param {Interaction} interaction
 * @return {Promise<void>}
 */
async function autoCompleteMsgID(interaction) {
    const giveaways = await interaction.client.models['giveaways']['Giveaway'].findAll({
        where: {
            ended: !(interaction.options['_subcommand'] === 'end')
        },
        order: [['createdAt', 'DESC']],
        max: 25
    });
    const matches = [];
    interaction.value = interaction.value.toLowerCase();
    for (const match of giveaways.filter(g => g.messageID.includes(interaction.value) || g.prize.toLowerCase().includes(interaction.value) || ((interaction.client.guild.channels.cache.get(g.channelID) || {name: g.channelID}).name).includes(interaction.value))) {
        matches.push({
            value: match.messageID,
            name: truncate(`${(interaction.client.guild.channels.cache.get(match.channelID) || {name: match.channelID}).name}: ${match.prize}`, 100)
        });
    }
    interaction.respond(matches);
}

module.exports.config = {
    name: 'gmanage',
    description: localize('giveaways', 'gmanage-description'),
    defaultPermission: false,
    permissions: function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['giveaways']['config']['allowed_roles'], 'ROLE');
    },
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'start',
            description: localize('giveaways', 'gmanage-start-description'),
            options: [
                {
                    type: 'CHANNEL',
                    name: 'channel',
                    required: true,
                    channelTypes: ['GUILD_TEXT', 'GUILD_NEWS'],
                    description: localize('giveaways', 'gmanage-channel-description')
                },
                {
                    type: 'STRING',
                    name: 'prize',
                    required: true,
                    description: localize('giveaways', 'gmanage-price-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: true,
                    description: localize('giveaways', 'gmanage-duration-description')
                },
                {
                    type: 'INTEGER',
                    name: 'winner-count',
                    required: true,
                    description: localize('giveaways', 'gmanage-winnercount-description')
                },
                {
                    type: 'INTEGER',
                    name: 'required-messages',
                    required: false,
                    description: localize('giveaways', 'gmanage-requiredmessages-description')
                },
                {
                    type: 'ROLE',
                    name: 'required-role',
                    required: false,
                    description: localize('giveaways', 'gmanage-requiredroles-description')
                },
                {
                    type: 'USER',
                    name: 'sponsor',
                    required: false,
                    description: localize('giveaways', 'gmanage-sponsor-description')
                },
                {
                    type: 'STRING',
                    name: 'sponsorlink',
                    required: false,
                    description: localize('giveaways', 'gmanage-sponsorlink-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'end',
            description: localize('giveaways', 'gend-description'),
            options: [
                {
                    type: 'STRING',
                    name: 'msg-id',
                    required: true,
                    autocomplete: true,
                    description: localize('giveaways', 'gereroll-msgid-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'reroll',
            description: localize('giveaways', 'gereroll-description'),
            options: [
                {
                    type: 'STRING',
                    name: 'msg-id',
                    required: true,
                    autocomplete: true,
                    description: localize('giveaways', 'gereroll-msgid-description')
                },
                {
                    type: 'INTEGER',
                    name: 'winner-count',
                    required: false,
                    description: localize('giveaways', 'gereroll-winnercount-description')
                }
            ]
        }
    ]
};