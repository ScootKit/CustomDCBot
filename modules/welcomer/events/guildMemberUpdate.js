const {
    randomElementFromArray,
    embedType,
    formatDate,
    embedTypeV2,
    formatDiscordUserName
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {assignJoinRoles} = require('./guildMemberAdd');

module.exports.run = async function (client, oldGuildMember, newGuildMember) {
    const moduleConfig = client.configurations['welcomer']['config'];

    if (!client.botReadyAt) return;
    if (oldGuildMember.pending && !newGuildMember.pending && !moduleConfig['assign-roles-immediately']) assignJoinRoles(newGuildMember, moduleConfig);

    if (newGuildMember.guild.id !== client.guild.id) return;

    if (!oldGuildMember.premiumSince && newGuildMember.premiumSince) {
        await sendBoostMessage('boost');
    }

    if (oldGuildMember.premiumSince && !newGuildMember.premiumSince) {
        await sendBoostMessage('unboost');
    }

    /**
     * Sends the boost message
     * @private
     * @param {String} type Type of the boost
     * @return {Promise<void>}
     */
    async function sendBoostMessage(type) {
        const moduleChannels = client.configurations['welcomer']['channels'];

        for (const channelConfig of moduleChannels.filter(c => c.type === type)) {
            const channel = await newGuildMember.guild.channels.fetch(channelConfig.channelID).catch(() => {
            });
            if (!channel || !channelConfig.channelID) {
                client.logger.error(localize('welcomer', 'channel-not-found', {c: channelConfig.channelID}));
                continue;
            }
            let message;
            if (channelConfig.randomMessages) {
                message = (randomElementFromArray(client.configurations['welcomer']['random-messages'].filter(m => m.type === type)) || {}).message;
            }
            if (!message) message = channelConfig.message;

            await newGuildMember.user.fetch();
            await channel.send(await embedTypeV2(message || 'Message not found',
                {
                    '%mention%': newGuildMember.toString(),
                    '%servername%': newGuildMember.guild.name,
                    '%tag%': formatDiscordUserName(newGuildMember.user),
                    '%guildUserCount%': client.guild.members.cache.size,
                    '%guildMemberCount%': client.guild.members.cache.filter(m => !m.user.bot).size,
                    '%memberProfileBannerUrl%': newGuildMember.user.bannerURL({size: 1024}),
                    '%memberProfilePictureUrl%': newGuildMember.user.avatarURL() || newGuildMember.user.defaultAvatarURL,
                    '%createdAt%': formatDate(newGuildMember.user.createdAt),
                    '%guildLevel%': localize('boostTier', client.guild.premiumTier),
                    '%boostCount%': client.guild.premiumSubscriptionCount,
                    '%joinedAt%': formatDate(newGuildMember.joinedAt)
                }
            ));

            if (moduleConfig['give-roles-on-boost'].length !== 0) {
                if (type === 'boost') newGuildMember.roles.add(moduleConfig['give-roles-on-boost']);
                else newGuildMember.roles.remove(moduleConfig['give-roles-on-boost']);
            }
        }
    }
};