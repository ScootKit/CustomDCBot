const {localize} = require('../../../src/functions/localize');

const {ThreadAutoArchiveDuration} = require('discord.js');

const d = {
    'MAX': ThreadAutoArchiveDuration.OneWeek,
    '60': ThreadAutoArchiveDuration.OneHour,
    '1440': ThreadAutoArchiveDuration.OneDay,
    '4320': ThreadAutoArchiveDuration.ThreeDays,
    '10080': ThreadAutoArchiveDuration.OneWeek
};

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.interaction || msg.system) return;
    const moduleConfig = client.configurations['auto-thread']['config'];
    if (!(moduleConfig.channels || []).includes(msg.channel.id)) return;
    if (!msg.hasThread) await msg.startThread({
        name: moduleConfig.threadName,

        autoArchiveDuration: d[moduleConfig.threadArchiveDuration],
        reason: `[auto-thread] ${localize('auto-thread', 'thread-create-reason')}`
    });
};