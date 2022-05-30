const {embedType} = require('../../../src/functions/helpers');

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.interaction || msg.system || !msg.guild || msg.guild.id !== client.config.guildID) return;
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
    const moduleConfig = msg.client.configurations['auto-react']['replys'];
    if (!msg.mentions.members) return;
    if (msg.author === client.user) return;
    msg.mentions.members.forEach(m => {
        console.log(moduleConfig);
        for (const element of moduleConfig) {
            if (element.member === m.id) {
                msg.reply(embedType(element.reply, {}, {ephemeral: true})).catch(() => {
                });
            }
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
 * Checks if a message need reactions (and reacts if needed) because it was send in a configured channel
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
