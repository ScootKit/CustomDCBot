const {
    randomElementFromArray,
    embedType,
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

    const args = {
        '%mention%': guildMember.toString(),
        '%servername%': guildMember.guild.name,
        '%tag%': formatDiscordUserName(guildMember.user),
        '%guildUserCount%': (await client.guild.members.fetch()).size,
        '%guildMemberCount%': (await client.guild.members.fetch()).filter(m => !m.user.bot).size,
        '%memberProfilePictureUrl%': guildMember.user.avatarURL() || guildMember.user.defaultAvatarURL,
        '%createdAt%': formatDate(guildMember.user.createdAt),
        '%guildLevel%': localize('boostTier', client.guild.premiumTier),
        '%boostCount%%': client.guild.premiumSubscriptionCount,
        '%joinedAt%': formatDate(guildMember.joinedAt)
    };
    if (moduleConfig.sendDirectMessageOnJoin) guildMember.user.send(await embedTypeV2(moduleConfig.joinDM, args)).then(() => {
    }).catch(() => {
    });

    const moduleChannels = client.configurations['welcomer']['channels'];

    if (!guildMember.pending && moduleConfig['give-roles-on-join'].length !== 0) {
        setTimeout(async () => {
            if (!guildMember.doNotGiveWelcomeRole) {
                const m = await guildMember.fetch(true);
                m.roles.add(moduleConfig['give-roles-on-join']).then(() => {
                });
            }
        }, 300);
    }

    for (const channelConfig of moduleChannels.filter(c => c.type === 'join')) {
        const channel = await guildMember.guild.channels.fetch(channelConfig.channelID).catch(() => {
        });
        if (!channel) {
            client.logger.error(localize('welcomer', 'channel-not-found', {c: channelConfig.channelID}));
            continue;
        }
        let message;
        if (channelConfig.randomMessages) {
            message = (randomElementFromArray(client.configurations['welcomer']['random-messages'].filter(m => m.type === 'join')) || {}).message;
        }
        if (!message) message = channelConfig.message;

        const components = [];
        if (channelConfig['welcome-button']) {
            components.push({
                type: 'ACTION_ROW',
                components: [
                    {
                        label: channelConfig['welcome-button-content'],
                        customId: 'welcome-' + guildMember.id,
                        style: 'PRIMARY',
                        type: 'BUTTON'
                    }
                ]
            });
        }
        const sentMessage = await channel.send(await embedTypeV2(message || 'Message not found',
            args,
            {},
            components
        ));
        const memberModel = await moduleModel.findOne({
            where: {
                userId: guildMember.id,
                channelID: sentMessage.channelId
            }
        });
        if (memberModel) {
            await memberModel.update({
                messageID: sentMessage.id,
                timestamp: new Date()
            });
        } else {
            await moduleModel.create({
                userID: guildMember.id,
                channelID: sentMessage.channelId,
                messageID: sentMessage.id,
                timestamp: new Date()
            });
        }
    }
};