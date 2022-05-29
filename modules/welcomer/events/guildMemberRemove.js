const {randomElementFromArray, embedType, formatDate} = require('../../../src/functions/helpers');
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

    const memberModel = await moduleModel.findOne({
        where: {
            userId: guildMember.id
        }
    });
    if (memberModel && moduleConfig['delete-welcome-message']) {
        for (const channelConfig of moduleChannels.filter(c => c.type === 'join')) {
            const channel = await guildMember.guild.channels.fetch(channelConfig.channelID).catch(() => {
            });
            if (await timer(client, guildMember.id)) {
                try {
                    await (await channel.messages.fetch(memberModel.messageID)).delete();
                } catch (e) {}
            }
        }
        await moduleModel.destroy({
            where: {
                userId: guildMember.id
            }
        });
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