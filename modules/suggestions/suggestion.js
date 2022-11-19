/**
 * Manages suggestion-embeds
 * @module Suggestions
 * @author Simon Csaba <mail@scderox.de>
 */
const {embedType} = require('../../src/functions/helpers');

module.exports.generateSuggestionEmbed = async function (client, suggestion) {
    const moduleConfig = client.configurations['suggestions']['config'];
    const channel = await client.channels.fetch(moduleConfig.suggestionChannel);
    const message = await channel.messages.fetch(suggestion.messageID);
    const user = await client.users.fetch(suggestion.suggesterID).catch(() => {
    });

    const params = {
        '%id%': suggestion.id,
        '%suggestion%': suggestion.suggestion,
        '%tag%': user.tag,
        '%avatarURL%': user.avatarURL(),
        '%adminUser%': suggestion.adminAnswer ? `<@${suggestion.adminAnswer.userID}>` : '',
        '%adminMessage%': suggestion.adminAnswer ? suggestion.adminAnswer.reason : ''
    };
    let field = 'unansweredSuggestion';
    if (suggestion.adminAnswer) {
        if (suggestion.adminAnswer.action === 'approve') field = 'approvedSuggestion';
        else field = 'deniedSuggestion';
    }
    await message.edit(embedType(moduleConfig[field], params));
};

/**
 * Notifies subscribed members of a suggestion about a change
 * @param {Client} client
 * @param {Object} suggestion Suggestion-Object
 * @param {String} change Type of change
 * @param {String} ignoredUserID User-ID of a user who should not get notified (usefully when they trigger the change)
 * @returns {Promise<void>}
 */
module.exports.notifyMembers = async function (client, suggestion, change, ignoredUserID = null) {
    const moduleConfig = client.configurations['suggestions']['config'];
    if (!moduleConfig['sendPNNotifications']) return;
    const subscribedMembers = [suggestion.suggesterID];
    if (suggestion.adminAnswer) {
        if (!subscribedMembers.includes(suggestion.adminAnswer.userID)) subscribedMembers.push(suggestion.adminAnswer.userID);
    }
    for (let user of subscribedMembers) {
        if (user === ignoredUserID) continue;
        user = await client.users.fetch(user).catch(() => {
        });
        if (user) {
            if (change === 'team') await user.send(embedType(moduleConfig['teamChange'], {
                '%title%': suggestion.suggestion,
                '%url%': `https://discord.com/channels/${client.guild.id}/${moduleConfig.suggestionChannel}/${suggestion.messageID}`
            })).catch(() => {
            });
        }
    }
};