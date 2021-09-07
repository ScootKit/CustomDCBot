exports.run = async (client, msg) => {
    if (msg.interaction || msg.system) return;
    await checkChannel(msg);
    await checkMembers(msg);
};

/**
 * Checks for member pings on a message and reacts with the configured emotes
 * @private
 * @param msg [Message](https://discord.js.org/#/docs/main/stable/class/Message)
 * @returns {Promise<void>}
 */
async function checkMembers(msg) {
    const moduleConfig = msg.client.configurations['auto-react']['config'];
    if (!msg.mentions.members) return;
    msg.mentions.members.forEach(m => {
        if (moduleConfig.members[m.id]) {
            moduleConfig.members[m.id].split('|').forEach(emoji => {
                msg.react(emoji).catch(() => {
                });
            });
        }
    });
}

/**
 * Checks if a message need reactions (and reacts if needed) because it was send in a configured channel
 * @private
 * @param msg [Message](https://discord.js.org/#/docs/main/stable/class/Message)
 * @returns {Promise<void>}
 */
async function checkChannel(msg) {
    const moduleConfig = msg.client.configurations['auto-react']['config'];
    if (!moduleConfig.channels[msg.channel.id]) return;
    moduleConfig.channels[msg.channel.id].split('|').forEach(emoji => {
        msg.react(emoji).catch(() => {
        });
    });
}