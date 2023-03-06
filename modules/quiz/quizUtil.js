/**
 * Create and manage quiz
 * @module quiz
 */
const {scheduleJob} = require('node-schedule');
const {MessageEmbed} = require('discord.js');
const {renderProgressbar, formatDate} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

/**
 * Creates a new quiz
 * @param {Object} data Data of the new quiz
 * @param {Client} client Client
 * @return {Promise<void>}
 */
async function createQuiz(data, client) {
    const votes = {};
    for (const vid in data.options) {
        votes[parseInt(vid) + 1] = [];
    }
    data.votes = votes;
    const id = await updateMessage(data.channel, data);

    await client.models['quiz']['Quiz'].create({
        messageID: id,
        description: data.description,
        options: data.options,
        channelID: data.channel.id,
        expiresAt: data.endAt,
        votes,
        canChangeVote: data.canChangeVote,
        type: data.type
    });

    if (data.endAt) {
        client.jobs.push(scheduleJob(data.endAt, async () => {
            await updateMessage(data.channel, await client.models['quiz']['Quiz'].findOne({where: {messageID: id}}), id);
        }));
    }
}

module.exports.createQuiz = createQuiz;

/**
 * Updates a quiz-message
 * @param {TextChannel} channel Channel in which the message is
 * @param {Object} data Data-Object (can be DB-Object)
 * @param {String} mID ID of already sent message
 * @return {Promise<*>}
 */
async function updateMessage(channel, data, mID = null) {
    const strings = channel.client.configurations.quiz.strings;
    const config = channel.client.configurations.quiz.config;
    let emojis = config.emojis;
    if (data.type === 'bool') emojis = [undefined, emojis['true'], emojis['false']];

    let m;
    if (mID) m = await channel.messages.fetch(mID).catch(() => {});
    const embed = new MessageEmbed()
        .setTitle(strings.embed.title)
        .setColor(strings.embed.color)
        .setDescription(data.description);
    let s = '';
    let p = '';
    let allVotes = 0;
    const expired = (data.expiresAt || data.endAt) ? data.expiresAt <= Date.now() || data.endAt <= Date.now() : false;
    for (const vid in data.votes) {
        allVotes = allVotes + data.votes[vid].length;
        if (expired) {
            if (data.options[parseInt(vid) - 1].correct) data.votes[vid].forEach(async voter => {
                const user = await client.models['quiz']['QuizUser'].findAll({
                    where: {
                        userID: voter
                    }
                });
                client.models['quiz']['QuizUser'].update({dailyQuiz: user.dailyQuiz + 1, xp: user.xp + 1}, {where: {userID: voter}});
            });
        }
    }

    for (const id in data.options) {
        const highlight = expired && data.options[id].correct ? '**' : '';
        const finishhighlight = data.options[id].correct ? '✅' : '❌';
        const percentage = 100 / allVotes * data.votes[(parseInt(id) + 1).toString()].length;

        s = s + highlight + (expired ? finishhighlight : '') + emojis[parseInt(id) + 1] + ': ' + data.options[id].text + ' `' + data.votes[(parseInt(id) + 1).toString()].length + '`' + highlight + '\n';
        p = p + highlight + emojis[parseInt(id) + 1] + ' ' + renderProgressbar(percentage) + ' ' + (percentage ? percentage.toFixed(0) : '0') +
            '% (' + data.votes[(parseInt(id) + 1).toString()].length + '/' + allVotes + ')' + highlight + '\n';
    }
    embed.addField(strings.embed.options, s);
    embed.addField(strings.embed.liveView, p);

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
            embed.setColor(strings.embed.endedQuizColor);
            embed.setTitle(strings.embed.endedQuizTitle);
            embed.addField('\u200b', localize('quiz', 'correct-highlighted'));
        } else {
            embed.addField('\u200b', '\u200b');
            embed.addField(strings.embed.expiresOn, strings.embed.thisQuizExpiresOn.split('%date%').join(formatDate(date)));
        }
    }

    const components = [];
    /* eslint-disable camelcase */
    if (data.type === 'bool') components.push({type: 'ACTION_ROW', components: [
        {type: 'BUTTON', customId: 'quiz-vote-0', label: localize('quiz', 'bool-true'), style: 'SUCCESS', disabled: expired},
        {type: 'BUTTON', customId: 'quiz-vote-1', label: localize('quiz', 'bool-false'), style: 'DANGER', disabled: expired}
    ]});
    else components.push({type: 'ACTION_ROW', components: [{type: 'SELECT_MENU', disabled: expired, customId: 'quiz-vote', min_values: 1, max_values: 1, placeholder: localize('quiz', 'vote'), options}]});
    components.push({type: 'ACTION_ROW', components: [{type: 'BUTTON', customId: 'quiz-own-vote', label: localize('quiz', 'what-have-i-voted'), style: 'SECONDARY'}]});

    let r;
    if (m) r = await m.edit({embeds: [embed], components});
    else r = await channel.send({embeds: [embed], components});
    return r.id;
}

module.exports.updateMessage = updateMessage;
