const {updateMessage} = require('../quizUtil');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async (client, interaction) => {
    if (!interaction.message) return;
    const quiz = await client.models['quiz']['Quiz'].findOne({
        where: {
            messageID: interaction.message.id
        }
    });
    if (!quiz) return;
    let expired = false;
    if (quiz.expiresAt || quiz.endAt) {
        const date = new Date(quiz.expiresAt || quiz.endAt);
        if (date.getTime() <= new Date().getTime()) expired = true;
    }

    if (interaction.isButton() && interaction.customId === 'quiz-own-vote') {
        let userVoteCat = null;
        for (const id in quiz.votes) {
            if (quiz.votes[id].includes(interaction.user.id)) userVoteCat = id;
        }
        if (!userVoteCat) return interaction.reply({
            content: '⚠ ' + localize('quiz', 'not-voted-yet'),
            ephemeral: true
        });
        let extra = '';
        if (!expired) {
            if (quiz.canChangeVote) extra = '\n' + localize('quiz', 'change-opinion');
            else extra = '\n' + localize('quiz', 'cannot-change-opinion');
        } else if (quiz.options[userVoteCat - 1].correct) extra = '\n\n' + localize('quiz', 'answer-correct');
        else extra = '\n\n' + localize('quiz', 'answer-wrong');
        return interaction.reply({
            content: localize('quiz', 'you-voted', {o: quiz.options[userVoteCat - 1].text}) + extra,
            ephemeral: true
        });
    }
    if ((interaction.isSelectMenu() && interaction.customId === 'quiz-vote') || (interaction.isButton() && interaction.customId.startsWith('quiz-vote-'))) {
        if (quiz.expiresAt && new Date(quiz.expiresAt).getTime() <= new Date().getTime()) return;
        const o = quiz.votes;
        quiz.votes = {};

        let back = false;
        for (const id in o) {
            if (o[id].includes(interaction.user.id) && !quiz.canChangeVote) {
                interaction.reply({content: localize('quiz', 'cannot-change-opinion'), ephemeral: true});
                back = true;
                break;
            }
            if (o[id] && o[id].includes(interaction.user.id)) o[id].splice(o[id].indexOf(interaction.user.id), 1);
        }
        if (back) return;
        o[(parseInt(interaction.isSelectMenu() ? interaction.values[0] : interaction.customId.split('-')[2]) + 1).toString()].push(interaction.user.id);
        quiz.votes = o;
        quiz.save();
        updateMessage(interaction.message.channel, quiz, interaction.message.id);
        interaction.reply({
            content: localize('quiz', 'voted-successfully'),
            ephemeral: true
        });
    }
    if (interaction.isButton() && interaction.customId === 'show-quiz-rank') {
        const user = await client.models['quiz']['QuizUser'].findOne({
            where: {
                userID: interaction.user.id
            }
        });
        if (user) interaction.reply({content: localize('quiz', 'your-rank', {xp: user.xp}), ephemeral: true});
        else interaction.reply({content: "⚠️ " + localize('quiz', 'no-rank'), ephemeral: true})
    }
};
