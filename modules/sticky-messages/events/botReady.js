const { deleteMessage, sendMessage } = require('./messageCreate.js');
let configCache = [];

module.exports.run = async function (client) {
    if (configCache.length === 0) {
        configCache = client.configurations['sticky-messages']['sticky-messages'];
        return;
    }

    client.configurations['sticky-messages']['sticky-messages'].forEach(msg => {
        if (configCache.find(c => c.channelId === msg.channelId && JSON.stringify(c.message) === JSON.stringify(msg.message))) return;
        deleteMessage(client.user.id, client.channels.cache.get(msg.channelId));
        sendMessage(client.channels.cache.get(msg.channelId), msg.message);
    });
    configCache = client.configurations['sticky-messages']['sticky-messages'];
};
