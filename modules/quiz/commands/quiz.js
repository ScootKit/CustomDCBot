const {ChannelType, ComponentType, MessageEmbed} = require('discord.js');
const durationParser = require('parse-duration');
const {
    formatDate,
    shuffleArray,
    parseEmbedColor
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {createQuiz} = require('../quizUtil');

/**
 * Handles quiz create commands
 * @param {Discord.ApplicationCommandInteraction} interaction
 */
async function create(interaction) {
    const config = interaction.client.configurations['quiz']['config'];
    if (!interaction.member.roles.cache.has(config.createAllowedRole)) return interaction.reply({
        content: localize('quiz', 'no-permission'),
        ephemeral: true
    });

    let endAt;
    let options = [];
    let emojis = config.emojis;
    if (interaction.options.getSubcommand() === 'create-bool') {
        options = [{text: localize('quiz', 'bool-true')}, {text: localize('quiz', 'bool-false')}];
        emojis = [null, emojis.true, emojis.false];
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
            type: ComponentType.ActionRow,
            components: [{
                /* eslint-disable camelcase */
                type: ComponentType.StringSelect,
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
    const collector = msg.createMessageComponentCollector({
        filter: i => interaction.user.id === i.user.id,
        componentType: ComponentType.StringSelect,
        max: 1
    });
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
        let user = await interaction.client.models['quiz']['QuizUser'].findAll({where: {userId: interaction.user.id}});
        if (user.length > 0) user = user[0];
        else user = await interaction.client.models['quiz']['QuizUser'].create({
            userID: interaction.user.id,
            dailyQuiz: 0
        });

        if (user.dailyQuiz >= interaction.client.configurations['quiz']['config'].dailyQuizLimit) {
            const now = new Date();
            now.setDate(now.getDate() + 1);
            now.setHours(0);
            now.setMinutes(0);
            now.setSeconds(0);

            return interaction.reply({
                content: localize('quiz', 'daily-quiz-limit', {
                    l: interaction.client.configurations['quiz']['config'].dailyQuizLimit,
                    timestamp: formatDate(now)
                }),
                ephemeral: true
            });
        }
        if (!interaction.client.configurations['quiz']['quizList'] || interaction.client.configurations['quiz']['quizList'].length === 0) return interaction.reply({
            content: localize('quiz', 'no-quiz'),
            ephemeral: true
        });

        const updatedUser = {dailyQuiz: user.dailyQuiz + 1};
        let quiz = {};
        if (interaction.client.configurations['quiz']['config'].mode.toLowerCase() === 'continuous') {
            quiz = interaction.client.configurations['quiz']['quizList'][user.nextQuizID] || interaction.client.configurations['quiz']['quizList'][0];
            updatedUser.nextQuizID = interaction.client.configurations['quiz']['quizList'][user.nextQuizID + 1] ? user.nextQuizID + 1 : 0;
        } else quiz = interaction.client.configurations['quiz']['quizList'][Math.floor(Math.random() * interaction.client.configurations['quiz']['quizList'].length)];

        quiz.channel = interaction.channel;
        quiz.options = shuffleArray([
            ...quiz.wrongOptions.map(o => ({text: o})),
            ...quiz.correctOptions.map(o => ({text: o, correct: true}))
        ]);
        quiz.endAt = new Date(new Date().getTime() + durationParser(quiz.duration));
        quiz.canChangeVote = false;
        quiz.private = true;
        createQuiz(quiz, interaction.client, interaction);

        interaction.client.models['quiz']['QuizUser'].update(updatedUser, {where: {userID: interaction.user.id}});
    },
    'leaderboard': async function (interaction) {
        const moduleStrings = interaction.client.configurations['quiz']['strings'];
        const users = await interaction.client.models['quiz']['QuizUser'].findAll({
            order: [
                ['xp', 'DESC']
            ],
            limit: 15
        });

        let leaderboardString = '';
        let i = 0;
        for (const user of users) {
            const member = interaction.guild.members.cache.get(user.userID);
            if (!member) continue;
            i++;
            leaderboardString = leaderboardString + localize('quiz', 'leaderboard-notation', {
                p: i,
                u: member.user.toString(),
                xp: user.xp
            }) + '\n';
        }
        if (leaderboardString.length === 0) leaderboardString = localize('levels', 'no-user-on-leaderboard');

        const embed = new MessageEmbed()
            .setTitle(moduleStrings.embed.leaderboardTitle)
            .setColor(parseEmbedColor(moduleStrings.embed.leaderboardColor))
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
            .setThumbnail(interaction.guild.iconURL())
            .addField(moduleStrings.embed.leaderboardSubtitle, leaderboardString);

        if (!interaction.client.strings.disableFooterTimestamp) embed.setTimestamp();

        const components = [{
            type: 'ACTION_ROW',
            components: [{
                type: 'BUTTON',
                label: moduleStrings.embed.leaderboardButton,
                style: 'SUCCESS',
                customId: 'show-quiz-rank'
            }]
        }];

        interaction.reply({embeds: [embed], components});
    }
};

module.exports.config = {
    name: 'quiz',
    description: localize('quiz', 'cmd-description'),

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
                        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice],
                        description: localize('quiz', 'cmd-create-channel-description')
                    },
                    {
                        type: 'STRING',
                        name: 'duration',
                        required: true,
                        description: localize('quiz', 'cmd-create-endAt-description')
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
                        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice],
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
            },
            {
                type: 'SUB_COMMAND',
                name: 'leaderboard',
                description: localize('quiz', 'cmd-leaderboard-description')
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