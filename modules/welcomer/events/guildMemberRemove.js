const {
    randomElementFromArray,
    formatDate,
    embedTypeV2,
    formatDiscordUserName
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, guildMember) {
    if (!client.botReadyAt) return;
    if (guildMember.guild.id !== client.guild.id) return;
    const moduleConfig = client.configurations['welcomer']['config'];
    const moduleModel = client.models['welcomer']['User'];
    if (guildMember.user.bot && moduleConfig['not-send-messages-if-member-is-bot']) return;

    const moduleChannels = client.configurations['welcomer']['channels'];

    for (const channelConfig of moduleChannels.filter(c => c.type === 'leave')) {
        const channel = await guildMember.guild.channels.fetch(channelConfig.channelID).catch(() => {
        });
        if (!channel) {
            client.logger.error(localize('welcomer', 'channel-not-found', {c: channelConfig.channelID}));
            continue;
        }

        let message;
        if (channelConfig.randomMessages) {
            message = (randomElementFromArray(client.configurations['welcomer']['random-messages'].filter(m => m.type === 'leave')) || {}).message;
        }
        if (!message) message = channelConfig.message;

        await channel.send(await embedTypeV2(message || 'Message not found',
            {
                '%mention%': guildMember.toString(),
                '%servername%': guildMember.guild.name,
                '%tag%': formatDiscordUserName(guildMember.user),
                '%guildUserCount%': (await client.guild.members.fetch()).size,
                '%guildMemberCount%': (await client.guild.members.fetch()).filter(m => !m.user.bot).size,
                '%memberProfilePictureUrl%': guildMember.user.avatarURL() || guildMember.user.defaultAvatarURL,
                '%createdAt%': formatDate(guildMember.user.createdAt),
                '%guildLevel%': client.guild.premiumTier,
                '%boostCount%%': client.guild.premiumSubscriptionCount,
                '%joinedAt%': formatDate(guildMember.joinedAt)
            }
        ));
    }
    if (!moduleConfig['delete-welcome-message']) return;
    const memberModels = await moduleModel.findAll({
        where: {
            userId: guildMember.id
        }
    });
    for (const memberModel of memberModels) {
        const channel = await guildMember.guild.channels.fetch(memberModel.channelID).catch(() => {
        });
        if (await timer(client, guildMember.id)) {
            try {
                await (await channel.messages.fetch(memberModel.messageID)).delete();
            } catch (e) {
            }
        }
        await memberModel.destroy();
    }
};

/**
 ** Function to handle the time stuff
 * @private
 * @param client Client of the bot
 * @param {userId} userId Id of the User
 * @returns {Promise<boolean>}
 */
async function timer(client, userId) {
    const model = client.models['welcomer']['User'];
    const timeModel = await model.findOne({
        where: {
            userId: userId
        }
    });
    if (timeModel) {
        // check timer duration
        return timeModel.timestamp.getTime() + 604800000 >= Date.now();
    }
}