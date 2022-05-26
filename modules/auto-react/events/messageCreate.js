module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.interaction || msg.system) return;
    await checkChannel(msg);
    await checkMembers(msg);
    await checkAuthor(msg);
    await checkMembersReply(msg);
};

/**
 * Checks for member pings in a message and reacts with the configured emotes
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
 * Checks for member pings in a message and replys with the configured message
 * @private
 * @param msg
 * @returns {Promise<void>}
 */
async function checkMembersReply(msg) {
    const moduleConfig = msg.client.configurations['auto-react']['config'];
    if (!msg.mentions.members) return;
    msg.mentions.members.forEach(m => {
        if (moduleConfig.membersReply[m.id]) {
            msg.reply(moduleConfig.membersReply[m.id]).catch(() => {
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

/**
 * Checks if a message need reactions (and reacts if needed) because it was send by a configured user
 * @private
 * @param msg [Message](https://discord.js.org/#/docs/main/stable/class/Message)
 * @returns {Promise<void>}
 */
async function checkAuthor(msg) {
    const moduleConfig = msg.client.configurations['auto-react']['config'];
    if (!moduleConfig.authors[msg.member.id]) return;
    moduleConfig.authors[msg.member.id].split('|').forEach(emoji => {
        msg.react(emoji).catch(() => {
        });
    });
}