/**
 * Create and manage quiz
 * @module quiz
 */
const {scheduleJob} = require('node-schedule');
const {ChannelType, MessageEmbed} = require('discord.js');
const {
    renderProgressbar,
    formatDate,
    parseEmbedColor
} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

let changed = false;

/**
 * Sets the changed variable to true
 */
function setChanged() {
    changed = true;
}

/**
 * Creates a new quiz
 * @param {Object} data Data of the new quiz
 * @param {Client} client Client
 * @param {Discord.ApplicationCommandInteraction} interaction? Interaction if private
 * @return {Promise<void>}
 */
async function createQuiz(data, client, interaction) {
    const votes = {};
    for (const vid in data.options) {
        votes[parseInt(vid) + 1] = [];
    }
    data.votes = votes;
    const id = await updateMessage(data.channel, data, null, data.private ? interaction : null);

    await client.models['quiz']['QuizList'].create({
        messageID: id,
        description: data.description,
        options: data.options,
        channelID: data.channel.id,
        expiresAt: data.endAt,
        votes,
        canChangeVote: data.canChangeVote,
        private: data.private || false,
        type: data.type
    });

    if (!data.private && data.endAt) {
        client.jobs.push(scheduleJob(data.endAt, async () => {
            await updateMessage(data.channel, await client.models['quiz']['QuizList'].findOne({where: {messageID: id}}), id);
        }));
    }
}

/**
 * Updates a quiz-message
 * @param {TextChannel} channel Channel in which the message is
 * @param {Object} data Data-Object (can be DB-Object)
 * @param {String} mID ID of already sent message
 * @param {Discord.ApplicationCommandInteraction} interaction? Interaction if private
 * @return {Promise<*>}
 */
async function updateMessage(channel, data, mID = null, interaction = null) {
    const strings = channel.client.configurations['quiz']['strings'];
    const config = channel.client.configurations['quiz']['config'];
    let emojis = config.emojis;
    if (data.type === 'bool') emojis = [null, emojis.true, emojis.false];

    let m;
    if (mID && !interaction) m = await channel.messages.fetch(mID).catch(() => {
    });
    const embed = new MessageEmbed()
        .setTitle(strings.embed.title)
        .setColor(parseEmbedColor(strings.embed.color))
        .setDescription(data.description);

    let allVotes = 0;
    const expired = (data.expiresAt || data.endAt) ? data.expiresAt <= Date.now() || data.endAt <= Date.now() : false;
    for (const vid in data.votes) {
        allVotes = allVotes + data.votes[vid].length;
        if (expired) {
            if (data.options[parseInt(vid) - 1].correct) data.votes[vid].forEach(async voter => {
                const user = await channel.client.models['quiz']['QuizUser'].findAll({
                    where: {
                        userID: voter
                    }
                });
                if (user.length > 0) channel.client.models['quiz']['QuizUser'].update({
                    dailyXp: user[0].dailyXp + 1,
                    xp: user[0].xp + 1
                }, {where: {userID: voter}});
                else channel.client.models['quiz']['QuizUser'].create({userID: voter, dailyXp: 1, xp: 1});
                changed = true;
            });
        }
    }

    let s = '';
    let p = '';
    for (const id in data.options) {
        const highlight = expired && data.options[id].correct ? '**' : '';
        const finishhighlight = data.options[id].correct ? '✅' : '❌';
        const percentage = 100 / allVotes * data.votes[(parseInt(id) + 1).toString()].length;

        s = s + highlight + (expired ? finishhighlight : '') + emojis[parseInt(id) + 1] + ': ' + data.options[id].text +
            ((config.livePreview || expired) && !data.private ? ' `' + data.votes[(parseInt(id) + 1).toString()].length + '`' : '') + highlight + '\n';
        p = p + highlight + emojis[parseInt(id) + 1] + ' ' + renderProgressbar(percentage) + ' ' + (percentage ? percentage.toFixed(0) : '0') +
            '% (' + data.votes[(parseInt(id) + 1).toString()].length + '/' + allVotes + ')' + highlight + '\n';
    }
    embed.addField(strings.embed.options, s);
    if ((config.livePreview || expired) && !data.private) embed.addField(strings.embed.liveView, p);

    const options = [];
    for (const vId in data.options) {
        options.push({
            label: data.options[vId].text,
            value: vId,
            description: localize('quiz', 'vote-this'),
            emoji: emojis[parseInt(vId) + 1]
        });
    }
    if (data.expiresAt || data.endAt) {
        const date = new Date(data.expiresAt || data.endAt);
        if (date.getTime() <= Date.now()) {
            embed.setColor(parseEmbedColor(strings.embed.endedQuizColor));
            embed.setTitle(strings.embed.endedQuizTitle);
            embed.addField('\u200b', localize('quiz', 'correct-highlighted'));
        } else {
            embed.addField('\u200b', '\u200b');
            embed.addField(strings.embed.expiresOn, strings.embed.thisQuizExpiresOn.split('%date%').join(formatDate(date)));
        }
    }

    const components = [];
    /* eslint-disable camelcase */
    if (data.type === 'bool') components.push({
        type: 'ACTION_ROW', components: [
            {
                type: 'BUTTON',
                customId: 'quiz-vote-0',
                label: localize('quiz', 'bool-true'),
                style: 'SUCCESS',
                disabled: expired
            },
            {
                type: 'BUTTON',
                customId: 'quiz-vote-1',
                label: localize('quiz', 'bool-false'),
                style: 'DANGER',
                disabled: expired
            }
        ]
    });
    else components.push({
        type: 'ACTION_ROW',
        components: [{
            type: 'SELECT_MENU',
            disabled: expired,
            customId: 'quiz-vote',
            min_values: 1,
            max_values: 1,
            placeholder: localize('quiz', 'vote'),
            options
        }]
    });
    if (!data.private) components.push({
        type: 'ACTION_ROW',
        components: [{
            type: 'BUTTON',
            customId: 'quiz-own-vote',
            label: localize('quiz', 'what-have-i-voted'),
            style: 'SECONDARY'
        }]
    });

    let r;
    if (data.private && interaction) r = await interaction.reply({
        embeds: [embed],
        components,
        fetchReply: true,
        ephemeral: true
    });
    else if (m) r = await m.edit({embeds: [embed], components});
    else r = await channel.send({embeds: [embed], components});
    return r.id;
}

/**
 * Updates the quiz leaderboard
 * @param {Client} client Client
 * @param {Boolean} force If enabled the embed will update even if there was no registered change
 * @return {Promise<Discord.Message>}
 */
async function updateLeaderboard(client, force = false) {
    if (!client.configurations['quiz']['config'].leaderboardChannel) return;
    if (!force && !changed) return;
    const moduleStrings = client.configurations['quiz']['strings'];
    const channel = await client.channels.fetch(client.configurations['quiz']['config']['leaderboardChannel']).catch(() => {
    });
    if (!channel || channel.type !== ChannelType.GuildText) return client.logger.error('[quiz] ' + localize('quiz', 'leaderboard-channel-not-found'));
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);

    const users = await client.models['quiz']['QuizUser'].findAll({
        order: [
            ['xp', 'DESC']
        ],
        limit: 15
    });

    let leaderboardString = '';
    let i = 0;
    for (const user of users) {
        const member = channel.guild.members.cache.get(user.userID);
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
        .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl})
        .setThumbnail(channel.guild.iconURL())
        .addField(moduleStrings.embed.leaderboardSubtitle, leaderboardString);

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    const components = [{
        type: 'ACTION_ROW',
        components: [{
            type: 'BUTTON',
            label: moduleStrings.embed.leaderboardButton,
            style: 'SUCCESS',
            customId: 'show-quiz-rank'
        }]
    }];

    if (messages.first()) await messages.first().edit({embeds: [embed], components});
    else await channel.send({embeds: [embed], components});
}

module.exports = {
    setChanged,
    createQuiz,
    updateMessage,
    updateLeaderboard
};