const {localize} = require('../../../src/functions/localize');

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.interaction || msg.system) return;
    const moduleConfig = client.configurations['auto-thread']['config'];
    if (!(moduleConfig.channels || []).includes(msg.channel.id)) return;

    if (!msg.hasThread) {
        let threadName = moduleConfig.threadName.replaceAll("%username%", msg.author.username);
    
        await msg.startThread({
            name: threadName,
            autoArchiveDuration: moduleConfig.threadArchiveDuration,
            reason: `[auto-thread] ${localize('auto-thread', 'thread-create-reason')}`
        });
    }
};