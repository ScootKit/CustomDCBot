const {confDir} = require('./../../main');
const {MessageEmbed} = require('discord.js');

module.exports.generateSuggestionEmbed = async function (client, suggestion) {
    const moduleConfig = require(`${confDir}/suggestions/config.json`);
    const channel = await client.channels.fetch(moduleConfig.suggestionChannel);
    const message = await channel.messages.fetch(suggestion.messageID);
    const member = await channel.guild.members.fetch(suggestion.suggesterID);

    const embed = new MessageEmbed()
        .setTitle(replacer(moduleConfig.suggestionEmbed.title))
        .setAuthor(member.user.tag, member.user.avatarURL())
        .setThumbnail(member.user.avatarURL())
        .setDescription(suggestion.suggestion)
        .addField('\u200b', '\u200b');
    let comments = '';
    suggestion.comments.forEach(comment => {
        comments = comments + `"${comment.comment}" ~ <@${comment.userID}>\n`;
    });
    if (comments === '') comments = replacer(moduleConfig.suggestionEmbed.noComment);
    embed.addField(moduleConfig.suggestionEmbed.commentsTitle, comments);

    embed.setColor('YELLOW');

    if (suggestion.adminAnswer) {
        embed.setColor(suggestion.adminAnswer.action === 'approve' ? 'GREEN' : 'RED');
        embed.addField(moduleConfig.suggestionEmbed.adminAnswerTitle.split('%status%').join(suggestion.adminAnswer.action === 'approve' ? 'Approved' : 'Denied'),
            `${suggestion.adminAnswer.action === 'approve' ? 'Approved' : 'Denied'} by <@${suggestion.adminAnswer.userID}> with the following reason: "${suggestion.adminAnswer.reason}"`);
    } else embed.addField(moduleConfig.suggestionEmbed.awaitingAdminAnswerTitle, moduleConfig.suggestionEmbed.awaitingAnswer);

    await message.edit('', embed);

    function replacer(string) {
        return string.split('%id%').join(suggestion.id);
    }
};