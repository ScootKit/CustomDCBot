const {truncate} = require('../../../src/functions/helpers');
const durationParser = require('parse-duration');
const {localize} = require('../../../src/functions/localize');
const {createQuiz, updateMessage} = require('../quizUtil');

/**
 * Handles quiz create commands
 * @param {Discord.ApplicationCommandInteraction} interaction
 */
async function create(interaction) {
    const config = interaction.client.configurations.quiz.config;
    let endAt;
    let options = [];
    let emojis = config.emojis;
    if (interaction.options.getSubcommand() === 'create-bool') {
        options = [{text: localize('quiz', 'bool-true')}, {text: localize('quiz', 'bool-false')}];
        emojis = [undefined, emojis.true, emojis.false];
    } else {
        for (let step = 1; step <= 10; step++) {
            if (interaction.options.getString('option' + step)) options.push({text: interaction.options.getString('option' + step)});
        }
    }

    const selectOptions = [];
    for (const vId in options) {
        selectOptions.push({
            label: options[vId].text,
            value: vId,
            description: localize('quiz', 'this-correct'),
            emoji: emojis[parseInt(vId) + 1]
        });
    }
    const msg = await interaction.reply({
        components: [{
            type: 'ACTION_ROW',
            components: [{
                /* eslint-disable camelcase */
                type: 'SELECT_MENU',
                custom_id: 'quiz',
                placeholder: localize('quiz', 'select-correct'),
                min_values: 1,
                max_values: interaction.options.getSubcommand() === 'create-bool' ? 1 : options.length,
                options: selectOptions
            }]
        }],
        ephemeral: true,
        fetchReply: true
    });
    const collector = msg.createMessageComponentCollector({filter: i => interaction.user.id === i.user.id, componentType: 'SELECT_MENU', max: 1});
    collector.on('collect', async i => {
        i.values.forEach(option => {
            options[option].correct = true;
        });

        if (interaction.options.getString('duration')) endAt = new Date(new Date().getTime() + durationParser(interaction.options.getString('duration')));
        await createQuiz({
            description: interaction.options.getString('description', true),
            channel: interaction.options.getChannel('channel', true),
            endAt,
            options,
            canChangeVote: interaction.options.getBoolean('canchange') || false,
            type: interaction.options.getSubcommand() === 'create-bool' ? 'bool' : 'normal'
        }, interaction.client);
        i.update({
            content: localize('quiz', 'created', {c: interaction.options.getChannel('channel').toString()}),
            components: []
        });
    });
}

module.exports.subcommands = {
    'create': create,
    'create-bool': create,
    'play': async function (interaction) {
        let user = interaction.client.models['quiz']['QuizUser'].findAll({where: {userId: interaction.user.id}});
        if (!user) user = await channel.client.models['quiz']['QuizUser'].create({userID: voter, dailyQuiz: 0});

        if (user.dailyQuiz >= interaction.configurations['quiz']['config'].dailyQuizLimit) return interaction.reply({content: localize('quiz', 'daily-quiz-limit', {l: interaction.configurations['quiz']['config'].dailyQuizLimit}), ephemeral: true});
        const quiz = interaction.client.configurations['quiz']['quizList'][Math.floor(Math.random() * interaction.client.configurations['quiz']['quizList'].length)];
        quiz.private = true;
        updateMessage(interaction.channel, quiz, interaction);
        channel.client.models['quiz']['QuizUser'].update({dailyQuiz: user[0].dailyQuiz + 1}, {where: {userID: interaction.user.id}});
    }
};

module.exports.config = {
    name: 'quiz',
    description: localize('quiz', 'cmd-description'),
    defaultPermission: false,
    options: function () {
        const options = [
            {
                type: 'SUB_COMMAND',
                name: 'create',
                description: localize('quiz', 'cmd-create-normal-description'),
                options: [{
                    type: 'STRING',
                    name: 'description',
                    required: true,
                    description: localize('quiz', 'cmd-create-description-description')
                },
                {
                    type: 'CHANNEL',
                    name: 'channel',
                    required: true,
                    channelTypes: ['GUILD_TEXT', 'GUILD_NEWS', 'GUILD_VOICE'],
                    description: localize('quiz', 'cmd-create-channel-description')
                },
                {
                    type: 'STRING',
                    name: 'option1',
                    required: true,
                    description: localize('quiz', 'cmd-create-option-description', {o: 1})
                },
                {
                    type: 'STRING',
                    name: 'option2',
                    required: true,
                    description: localize('quiz', 'cmd-create-option-description', {o: 2})
                },
                {
                    type: 'BOOLEAN',
                    name: 'canchange',
                    required: false,
                    description: localize('quiz', 'cmd-create-canchange-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: false,
                    description: localize('quiz', 'cmd-create-endAt-description')
                }]
            },
            {
                type: 'SUB_COMMAND',
                name: 'create-bool',
                description: localize('quiz', 'cmd-create-bool-description'),
                options: [{
                    type: 'STRING',
                    name: 'description',
                    required: true,
                    description: localize('quiz', 'cmd-create-description-description')
                },
                {
                    type: 'CHANNEL',
                    name: 'channel',
                    required: true,
                    channelTypes: ['GUILD_TEXT', 'GUILD_NEWS', 'GUILD_VOICE'],
                    description: localize('quiz', 'cmd-create-channel-description')
                },
                {
                    type: 'BOOLEAN',
                    name: 'canchange',
                    required: false,
                    description: localize('quiz', 'cmd-create-canchange-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: false,
                    description: localize('quiz', 'cmd-create-endAt-description')
                }]
            },
            {
                type: 'SUB_COMMAND',
                name: 'play',
                description: localize('quiz', 'cmd-play-description')
            }
        ];
        for (let step = 1; step <= 7; step++) {
            options[0].options.push({
                type: 'STRING',
                name: `option${2 + step}`,
                required: false,
                description: localize('quiz', 'cmd-create-option-description', {o: 2 + step})
            });
        }
        return options;
    }
};
