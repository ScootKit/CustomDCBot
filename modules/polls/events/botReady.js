const {updateMessage} = require('../polls');
const {scheduleJob} = require('node-schedule');

module.exports.run = async (client) => {
    const polls = await client.models['polls']['Poll'].findAll();

    polls.forEach(poll => {
        if (poll.expiresAt && new Date(poll.expiresAt).getTime() > new Date().getTime()) scheduleJob(new Date(poll.expiresAt), async () => {
            await updateMessage(await client.channels.fetch(poll.channelID), poll, poll.messageID);
        });
    });
};