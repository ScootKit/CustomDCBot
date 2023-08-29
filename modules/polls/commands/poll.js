const {truncate} = require('../../../src/functions/helpers');
const durationParser = require('parse-duration');
const {localize} = require('../../../src/functions/localize');
const {createPoll, updateMessage} = require('../polls');

module.exports.subcommands = {
    'create': async function (interaction) {
        if (interaction.options.getChannel('channel', true).type !== 'GUILD_TEXT') interaction.reply({
            content: '⚠️️ ' + localize('polls', 'not-text-channel'),
            ephemeral: true
        });
        let endAt;
        if (interaction.options.getString('duration')) endAt = new Date(new Date().getTime() + durationParser(interaction.options.getString('duration')));
        const options = [];
        for (let step = 1; step <= 10; step++) {
            if (interaction.options.getString(`option${step}`)) options.push(interaction.options.getString(`option${step}`));
        }
        await createPoll({
            description: (interaction.options.getBoolean('public') ? '[PUBLIC]' : '') + interaction.options.getString('description', true),
            channel: interaction.options.getChannel('channel', true),
            endAt: endAt,
            options
        }, interaction.client);
        interaction.reply({
            content: localize('polls', 'created-poll', {c: interaction.options.getChannel('channel').toString()}),
            ephemeral: true
        });
    },
    'end': async function (interaction) {
        const poll = await interaction.client.models['polls']['Poll'].findOne({
            where: {
                messageID: interaction.options.getString('msg-id')
            }
        });
        if (!poll) return interaction.reply({
            content: '⚠️️ ' + localize('polls', 'not-found'),
            ephemeral: true
        });
        poll.expiresAt = new Date();
        await poll.save();
        await updateMessage(await interaction.guild.channels.cache.get(poll.channelID), poll, interaction.options.getString('msg-id'));
        interaction.reply({
            content: localize('polls', 'ended-poll'),
            ephemeral: true
        });
    }
};

module.exports.autoComplete = {
    'end': {
        'msg-id': async function(interaction) {
            const polls = [];
            const allPolls = await interaction.client.models['polls']['Poll'].findAll();
            for (const poll of allPolls) {
                if (!poll.expiresAt) {
                    polls.push(poll);
                    continue;
                }
                if (poll.expiresAt && new Date(poll.expiresAt).getTime() > new Date().getTime()) polls.push(poll);
            }
            interaction.value = interaction.value.toLowerCase();
            const returnValue = [];
            for (const poll of polls.filter(p => p.description.toLowerCase().includes(interaction.value) || p.messageID.toString().includes(interaction.value))) {
                if (returnValue.length !== 25) returnValue.push({
                    value: poll.messageID,
                    name: truncate(`#${(interaction.client.guild.channels.cache.get(poll.channelID) || {name: poll.channelID}).name}: ${poll.description.replaceAll('[PUBLIC]', '')}`, 100)
                });
            }
            interaction.respond(returnValue);
        }
    }
};

module.exports.config = {
    name: 'poll',
    description: localize('polls', 'command-poll-description'),
    defaultPermission: false,
    options: function () {
        const options = [
            {
                type: 'SUB_COMMAND',
                name: 'create',
                description: localize('polls', 'command-poll-create-description'),
                options: [{
                    type: 'STRING',
                    name: 'description',
                    required: true,
                    description: localize('polls', 'command-poll-create-description-description')
                },
                {
                    type: 'CHANNEL',
                    name: 'channel',
                    required: true,
                    channelTypes: ['GUILD_TEXT'],
                    description: localize('polls', 'command-poll-create-channel-description')
                },
                {
                    type: 'STRING',
                    name: 'option1',
                    required: true,
                    description: localize('polls', 'command-poll-create-option-description', {o: 1})
                },
                {
                    type: 'STRING',
                    name: 'option2',
                    required: true,
                    description: localize('polls', 'command-poll-create-option-description', {o: 2})
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: false,
                    description: localize('polls', 'command-poll-create-endAt-description')
                },
                {
                    type: 'BOOLEAN',
                    name: 'public',
                    required: false,
                    description: localize('polls', 'command-poll-create-public-description')
                }
                ]
            },
            {
                type: 'SUB_COMMAND',
                name: 'end',
                description: localize('polls', 'command-poll-end-description'),
                options: [
                    {
                        type: 'STRING',
                        name: 'msg-id',
                        required: true,
                        autocomplete: true,
                        description: localize('polls', 'command-poll-end-msgid-description')
                    }
                ]
            }
        ];
        for (let step = 1; step <= 7; step++) {
            options[0].options.push({
                type: 'STRING',
                name: `option${2 + step}`,
                required: false,
                description: localize('polls', 'command-poll-create-option-description', {o: 2 + step})
            });
        }
        return options;
    }
};