const {randomElementFromArray, embedType, formatDate} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, guildMember) {
    if (!client.botReadyAt) return;
    if (guildMember.guild.id !== client.guild.id) return;
    const moduleConfig = client.configurations['welcomer']['config'];
    const moduleModel = client.models['welcomer']['User'];
    if (guildMember.user.bot && moduleConfig['not-send-messages-if-member-is-bot']) return;

    const moduleChannels = client.configurations['welcomer']['channels'];

    if (!guildMember.pending && moduleConfig['give-roles-on-join'].length !== 0) {
        await guildMember.roles.add(moduleConfig['give-roles-on-join']);
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

        const sentMessage = await channel.send(embedType(message || 'Message not found',
            {
                '%mention%': guildMember.toString(),
                '%servername%': guildMember.guild.name,
                '%tag%': guildMember.user.tag,
                '%guildUserCount%': (await client.guild.members.fetch()).size,
                '%guildMemberCount%': (await client.guild.members.fetch()).filter(m => !m.user.bot).size,
                '%memberProfilePictureUrl%': guildMember.user.avatarURL(),
                '%createdAt%': formatDate(guildMember.user.createdAt)
            }
        ));

        const memberModel = await moduleModel.findOne({
            where: {
                userId: guildMember.id
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
                messageID: sentMessage.id,
                timestamp: new Date()
            });
        }
    }
};