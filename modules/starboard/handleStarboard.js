const { embedTypeV2, disableModule, formatDiscordUserName } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

module.exports = async (client, msgReaction, user, isReactionRemove = false) => {
    if (!client.botReadyAt) return;
    const msg = msgReaction.message;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (msgReaction.partial) msgReaction = await msgReaction.fetch();

    const starConfig = client.configurations['starboard']['config'];
    if (!starConfig || (starConfig.emoji !== msgReaction.emoji.name && starConfig.emoji !== msgReaction.emoji.id)) return;
    if (isNaN(starConfig.minStars)) return disableModule('starboard', localize('starboard', 'invalid-minstars', {stars: starConfig.minStars}));

    const starMsg = await client.models['starboard']['StarMsg'].findOne({
        where: {
            msgId: msg.id
        }
    });

    const channel = client.channels.cache.get(starConfig.channelId);
    if (!channel) return disableModule('starboard', localize('partner-list', 'channel-not-found', {c: starConfig.channelId}));
    if ((msg.channel.nsfw && !channel.nsfw) || starConfig.excludedChannels.includes(msg.channel.id) || starConfig.excludedRoles.some(r => msg.member.roles.cache.has(r))) return;

    const starUser = await client.models['starboard']['StarUser'].findOne({
        where: {
            userId: user.id
        }
    });
    if (starUser.recentStars.length >= starConfig.starsPerHour) {
        return msgReaction.users.remove(user.id).catch(() => {}).then(() => {
            user.send(localize('starboard', 'star-limit')).catch(() => {});
        });
    }

    let reactioncount = msgReaction.count;
    if (!starConfig.selfStar && msgReaction.users.cache.has(msg.author.id)) reactioncount--;

    const starboardMsg = starMsg ? await channel.messages.fetch(starMsg.starMsg).catch(() => {}) : null;
    if (reactioncount < starConfig.minStars) {
        if (isReactionRemove) {
            if (starboardMsg) starboardMsg.delete();
            client.models['starboard']['StarMsg'].destroy({
                where: {
                    msgId: msg.id
                }
            });
        }
        return;
    }

    const generatedMsg = await embedTypeV2(starConfig.message, {
        '%stars%': msgReaction.count,
        '%content%': msg.content,
        '%link%': msg.url,
        '%userID%': msg.author.id,
        '%userName%': msg.author.username,
        '%displayName%': msg.member.displayName,
        '%userTag%': formatDiscordUserName(msg.author),
        '%userAvatar%': msg.member.displayAvatarURL({dynamic: true}),
        '%channelName%': msg.channel.name,
        '%channelMention%': '<#' + msg.channel.id + '>',
        '%emoji%': msgReaction.emoji.toString()
    });

    if (starboardMsg) starboardMsg.edit(generatedMsg);
    else {
        const sentMessage = await channel.send(generatedMsg);

        client.models['starboard']['StarMsg'].create({
            msgId: msg.id,
            starMsg: sentMessage.id
        });
    }
};
