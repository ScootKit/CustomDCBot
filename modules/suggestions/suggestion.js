/**
 * Manages suggestion-embeds
 * @module Suggestions
 * @author Simon Csaba <mail@scderox.de>
 */
const {MessageEmbed} = require('discord.js');
const {embedType} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

module.exports.generateSuggestionEmbed = async function (client, suggestion) {
    const moduleConfig = client.configurations['suggestions']['config'];
    const channel = await client.channels.fetch(moduleConfig.suggestionChannel);
    const message = await channel.messages.fetch(suggestion.messageID);
    let member = await client.guild.members.fetch(suggestion.suggesterID).catch(() => {
    });
    if (!member) { // I could fetch the data another way so we don't have to show fake data
        member = {
            user: {
                tag: 'Clyde#1234',
                avatarURL: function () {
                    return 'https://www.kindpng.com/picc/m/105-1055656_account-user-profile-avatar-avatar-user-profile-icon.png';
                }
            }
        };
    }

    const embed = new MessageEmbed()
        .setTitle(replacer(moduleConfig.suggestionEmbed.title))
        .setAuthor({name: member.user.tag, iconURL: member.user.avatarURL()})
        .setThumbnail(member.user.avatarURL())
        .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl})
        .setDescription(suggestion.suggestion)
        .addField('\u200b', '\u200b');

    if (moduleConfig['commentType'] === 'command') {
        let comments = '';
        suggestion.comments.forEach(comment => {
            comments = comments + `"${comment.comment}" ~ <@${comment.userID}>\n`;
        });
        if (comments === '') comments = replacer(moduleConfig.suggestionEmbed.noComment);
        embed.addField(moduleConfig.suggestionEmbed.commentsTitle, comments);
    }

    embed.setColor('YELLOW');

    if (suggestion.adminAnswer) {
        embed.setColor(suggestion.adminAnswer.action === 'approve' ? 'GREEN' : 'RED');
        embed.addField(moduleConfig.suggestionEmbed.adminAnswerTitle.replaceAll('%status%', suggestion.adminAnswer.action === 'approve' ? localize('suggestions', 'approved') : localize('suggestions', 'denied')),
            localize('suggestions', 'admin-answer', {status: suggestion.adminAnswer.action === 'approve' ? localize('suggestions', 'approved') : localize('suggestions', 'denied'),
                u: `<@${suggestion.adminAnswer.userID}>`,
                r: suggestion.adminAnswer.reason}));
    } else embed.addField(moduleConfig.suggestionEmbed.awaitingAdminAnswerTitle, moduleConfig.suggestionEmbed.awaitingAnswer);

    await message.edit({content: '\u200b', embeds: [embed]});

    /**
     * Replaces variables in a string
     * @private
     * @param {String} string string to replace variables in
     * @returns {String} String with replaced variables
     */
    function replacer(string) {
        return string.split('%id%').join(suggestion.id);
    }
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
    suggestion.comments.forEach(c => {
        if (!subscribedMembers.includes(c.userID)) subscribedMembers.push(c.userID);
    });
    if (suggestion.adminAnswer) {
        if (!subscribedMembers.includes(suggestion.adminAnswer.userID)) subscribedMembers.push(suggestion.adminAnswer.userID);
    }
    for (let user of subscribedMembers) {
        if (user === ignoredUserID) continue;
        user = await client.users.fetch(user).catch(() => {
        });
        if (user) {
            if (change === 'comment') await user.send(embedType(moduleConfig['newCommentNotification'], {
                '%title%': suggestion.suggestion,
                '%url%': `https://discord.com/channels/${client.guild.id}/${moduleConfig.suggestionChannel}/${suggestion.messageID}`
            })).catch(() => {
            });
            if (change === 'team') await user.send(embedType(moduleConfig['teamChange'], {
                '%title%': suggestion.suggestion,
                '%url%': `https://discord.com/channels/${client.guild.id}/${moduleConfig.suggestionChannel}/${suggestion.messageID}`
            })).catch(() => {
            });
        }
    }
};