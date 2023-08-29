const {embedType} = require('../../../src/functions/helpers');
module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.interaction || msg.system || !msg.author || !msg.guild || msg.guild.id !== client.config.guildID) return;
    await checkChannel(msg);
    await checkMembers(msg);
    await checkCategory(msg);
    await checkAuthor(msg);
    await checkMembersReply(msg);
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
    for (const m of msg.mentions.members.values()) {
        if (!msg.content.replaceAll('!', '').includes(`<@${m.id}>`) && moduleConfig.forcedMentionMatching) continue;
        if (moduleConfig.members[m.id]) moduleConfig.members[m.id].split('|').forEach(emoji => {
            msg.react(emoji).catch(() => {
            });
        });
    }
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
 * Checks if a message need reactions (and reacts if needed) because it was send in a configured category
 * @private
 * @param msg [Message](https://discord.js.org/#/docs/main/stable/class/Message)
 * @returns {Promise<void>}
 */
async function checkCategory(msg) {
    const moduleConfig = msg.client.configurations['auto-react']['config'];
    if (!moduleConfig.categories[msg.channel.parentId]) return;
    moduleConfig.categories[msg.channel.parentId].split('|').forEach(emoji => {
        msg.react(emoji).catch(() => {
        });
    });
}

/**
 * Checks for member pings in a message and replys with the configured message
 * @private
 * @param msg
 * @returns {Promise<void>}
 */
async function checkMembersReply(msg) {
    const moduleConfig = msg.client.configurations['auto-react']['replies'];
    if (!msg.mentions.users) return;
    if (msg.author.id === msg.client.user.id) return;
    for (const m of msg.mentions.users.values()) {
        if (!msg.content.replaceAll('!', '').includes(`<@${m.id}>`) && msg.client.configurations['auto-react']['config'].forcedMentionMatching) continue;
        const matches = moduleConfig.filter(c => c.members === m.id);
        for (const element of matches) {
            await msg.reply(embedType(element.reply, {}, {ephemeral: true})).catch(() => {
            });
        }
    }
}


/**
 * Checks if a message need reactions (and reacts if needed) because it was send in a configured channel
 * @private
 * @param msg [Message](https://discord.js.org/#/docs/main/stable/class/Message)
 * @returns {Promise<void>}
 */
async function checkAuthor(msg) {
    const moduleConfig = msg.client.configurations['auto-react']['config'];
    if (!moduleConfig.authors[msg.author.id]) return;
    moduleConfig.authors[msg.author.id].split('|').forEach(emoji => {
        msg.react(emoji).catch(() => {
        });
    });
}