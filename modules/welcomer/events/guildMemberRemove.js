const {randomElementFromArray, embedType, formatDate} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, guildMember) {
    if (!client.botReadyAt) return;
    if (guildMember.guild.id !== client.guild.id) return;
    const moduleConfig = client.configurations['welcomer']['config'];
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

        await channel.send(embedType(message || 'Message not found',
            {
                '%tag%': guildMember.user.tag,
                '%memberProfilePictureUrl%': guildMember.user.avatarURL({dynamic: true}),
                '%joinedAt%': formatDate(guildMember.joinedAt),
                '%guildUserCount%': (await client.guild.members.fetch()).size,
                '%guildMemberCount%': (await client.guild.members.fetch()).filter(m => !m.user.bot).size
            }
        ));
    }
};