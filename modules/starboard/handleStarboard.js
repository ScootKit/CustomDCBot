const {embedTypeV2, disableModule, formatDiscordUserName} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');
const {Op} = require('sequelize');

module.exports = async (client, msgReaction, user, isReactionRemove = false) => {
    if (!client.botReadyAt) return;
    const msg = msgReaction.message;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (msgReaction.partial) msgReaction = await msgReaction.fetch();

    const starConfig = client.configurations['starboard']['config'];
    if (!starConfig || starConfig.emoji !== msgReaction.emoji.toString()) return;
    if (isNaN(starConfig.minStars)) return disableModule('starboard', localize('starboard', 'invalid-minstars', {stars: starConfig.minStars}));

    const channel = client.channels.cache.get(starConfig.channelId);
    if (!channel) return disableModule('starboard', localize('partner-list', 'channel-not-found', {c: starConfig.channelId}));
    if ((msg.channel.nsfw && !channel.nsfw) || starConfig.excludedChannels.includes(msg.channel.id) || starConfig.excludedRoles.some(r => msg.member.roles.cache.has(r))) return;
    if (!starConfig.selfStar && user.id === msg.author.id) return msgReaction.users.remove(user.id).catch(() => {
    });

    const starUser = await client.models['starboard']['StarUser'].findAll({
        where: {
            userId: user.id,
            createdAt: {
                [Op.gt]: Date.now() - 1000 * 60 * 60
            }
        }
    });

    if (!isReactionRemove) {
        if (starUser.length >= starConfig.starsPerHour) {
            if (!isReactionRemove) {
                user.send(localize('starboard', 'star-limit', {
                    limitEmoji: '**' + starConfig.starsPerHour + '** ' + starConfig.emoji,
                    msgUrl: msg.url,
                    time: '<t:' + Math.floor((new Date(starUser[0].dataValues.createdAt).getTime() + 1000 * 60 * 60) / 1000) + ':R>'
                })).catch(() => {
                });
                msgReaction.users.remove(user.id).catch(() => {
                });
            }
        }
        return;
    }

    if (!isReactionRemove) {
        await client.models['starboard']['StarUser'].create({
            userId: user.id,
            msgId: msg.id
        });
    }

    let reactioncount = msgReaction.count;
    if (!starConfig.selfStar && msgReaction.users.cache.has(msg.author.id)) reactioncount--;

    const starMsg = await client.models['starboard']['StarMsg'].findOne({
        where: {
            msgId: msg.id
        }
    });

    const starboardMsg = starMsg ? await channel.messages.fetch(starMsg.starMsg).catch(() => {
    }) : null;
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

    let image = msg.attachments.size > 0 ? msg.attachments.first().url : null;
    if (!image) {
        const matches = msg.content.match(/https?:\/\/.*\.(?:png|jpg|gif|jpeg|webp)/i);
        if (matches) image = matches[0];
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
        '%emoji%': msgReaction.emoji.toString(),
        '%image%': image
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