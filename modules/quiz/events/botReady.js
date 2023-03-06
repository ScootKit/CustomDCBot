const {updateMessage} = require('../quizUtil');
const {scheduleJob} = require('node-schedule');

module.exports.run = async (client) => {
    const quizList = await client.models['quiz']['Quiz'].findAll();

    quizList.forEach(quiz => {
        if (quiz.expiresAt && new Date(quiz.expiresAt).getTime() > new Date().getTime()) scheduleJob(new Date(quiz.expiresAt), async () => {
            await updateMessage(await client.channels.fetch(quiz.channelID), quiz, quiz.messageID);
        });
    });
};
