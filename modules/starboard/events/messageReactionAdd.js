const { embedTypeV2 } = require('../../../src/functions/helpers');

module.exports.run = async (client, msgReaction) => {
    if (!client.botReadyAt) return;
    const msg = msgReaction.message;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;

    const starConfig = client.configurations['starboard']['config'];
    if (!starConfig || (starConfig.emoji !== msgReaction.emoji.name && starConfig.emoji !== msgReaction.emoji.id)) return;

    const starMsg = await client.models['starboard']['StarMsg'].findOne({
        where: {
            msgId: msg.id
        }
    });

    const channel = client.channels.cache.get(starConfig.channelId);
    if (!channel) return disableModule('starboard', localize('partner-list', 'channel-not-found', {c: starConfig.channelId}));

    const starboardMsg = starMsg ? await channel.messages.fetch(starMsg.starMsg).catch(() => {}) : undefined;
    const generatedMsg = await embedTypeV2(starConfig.message, {
        "%stars%": msgReaction.count,
        "%content%": msg.content
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
