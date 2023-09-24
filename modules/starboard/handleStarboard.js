const { embedTypeV2, formatDiscordUserName } = require('../../src/functions/helpers');

module.exports = async (client, msgReaction, isReactionRemove = false) => {
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
        '%username%': msg.author.username,
        '%usertag%': formatDiscordUserName(msg.author),
        '%nickname%': msg.member ? msg.member.displayName : msg.author.username,
        '%authoravatar%': msg.author.displayAvatarURL({dynamic: true}),
        '%userid%': msg.author.id,
        '%channelname%': msg.channel.name,
        '%channelmention%': '<#' + msg.channel.id + '>',
        '%link%': msg.url,
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
