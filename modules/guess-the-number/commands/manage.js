const {localize} = require('../../../src/functions/localize');
const {randomIntFromInterval, embedType, lockChannel, unlockChannel} = require('../../../src/functions/helpers');

module.exports.beforeSubcommand = async function(interaction) {
    if (interaction.member.roles.cache.filter(m => interaction.client.configurations['guess-the-number']['config'].adminRoles.includes(m.id)).size === 0) return interaction.reply({ephemeral: true, content: '⚠ To use this command, you need to be added to the adminRoles option in the SCNX-Dashboard.'});
};

module.exports.subcommands = {
    'end': async function(interaction) {
        if (interaction.replied) return;
        const item = await interaction.client.models['guess-the-number']['Channel'].findOne({where: {channelID: interaction.channel.id, ended: false}});
        if (!item) return interaction.reply({
            content: '⚠ ' + localize('guess-the-number', 'session-not-running'),
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
            content: '⚠ ' + localize('guess-the-number', 'session-not-running'),
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
            content: '⚠ ' + localize('guess-the-number', 'session-already-running'),
            ephemeral: true
        });
        if (interaction.options.getInteger('min') >= interaction.options.getInteger('max')) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('guess-the-number', 'min-max-discrepancy')
        });
        const number = interaction.options.getInteger('number') || randomIntFromInterval(interaction.options.getInteger('min'), interaction.options.getInteger('max'));
        await interaction.client.models['guess-the-number']['Channel'].create({
            channelID: interaction.channel.id,
            number,
            min: interaction.options.getInteger('min'),
            max: interaction.options.getInteger('max'),
            ownerID: interaction.user.id,
            ended: false
        });
        const pins = await interaction.channel.messages.fetchPinned();
        for (const pin of pins.values()) {
            if (pin.author.id !== interaction.client.user.id) continue;
            await pin.unpin();
        }
        const m = await interaction.channel.send(embedType(interaction.client.configurations['guess-the-number']['config'].startMessage, {'%min%': interaction.options.getInteger('min'), '%max%': interaction.options.getInteger('max')}, {components: [{
            type: 'ACTION_ROW',
            components: [{
                type: 'BUTTON',
                label: localize('guess-the-number', 'emoji-guide-button'),
                style: 'LINK',
                url: localize('guess-the-number', 'emoji-guide-link')
            }]
        }]}));
        await m.pin();

        await unlockChannel(interaction.channel, '[guess-the-number] ' + localize('guess-the-number', 'game-started'));

        await interaction.reply({
            ephemeral: true,
            content: localize('guess-the-number', 'created-successfully', {n: number})
        });
    }
};

module.exports.config = {
    name: 'guess-the-number',
    description: localize('guess-the-number', 'command-description'),
    defaultPermission: false,
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