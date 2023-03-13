const {updateMessage, updateLeaderboard} = require('../quizUtil');
const {scheduleJob} = require('node-schedule');

module.exports.run = async (client) => {
    const quizList = await client.models['quiz']['QuizList'].findAll();
    quizList.forEach(quiz => {
        if (!quiz.private && quiz.expiresAt && new Date(quiz.expiresAt).getTime() > new Date().getTime()) scheduleJob(new Date(quiz.expiresAt), async () => {
            await updateMessage(await client.channels.fetch(quiz.channelID), quiz, quiz.messageID);
        });
    });

    if (client.configurations['quiz']['config'].leaderboardChannel) {
        await updateLeaderboard(client, true);
        const interval = setInterval(() => {
            updateLeaderboard(client);
        }, 300042);
        client.intervals.push(interval);
    }

    const job = scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_*
        const users = await client.models['quiz']['QuizUser'].findAll();
        users.forEach(user => {
            user.dailyQuiz = 0;
            user.save();
        });
    });
    client.jobs.push(job);
};
