const {scheduleJob} = require('node-schedule');
const {embedType, formatDiscordUserName} = require('../../src/functions/helpers');

/**
 * Plans a reminder
 * @param {Client} client
 * @param {NotifcationObject} notificationObject
 */
function planReminder(client, notificationObject) {
    if (notificationObject.date.getTime() <= new Date().getTime()) return;
    const bj = scheduleJob(notificationObject.date, async () => {
        const member = await client.guild.members.fetch(notificationObject.userID).catch(() => {
        });
        if (!member) return;
        const channel = notificationObject.channelID === 'DM' ? await member.user.createDM() : client.guild.channels.cache.get(notificationObject.channelID);
        if (!channel) return;
        channel.send(embedType(client.configurations['reminders']['config']['notificationMessage'], {
            '%mention%': member.user.toString(),
            '%message%': notificationObject.reminderText,
            '%userTag%': formatDiscordUserName(member.user),
            '%userAvatarURL%': member.user.avatarURL()
        }));
    });
    client.jobs.push(bj);
}

module.exports.planReminder = planReminder;