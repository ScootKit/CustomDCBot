const {planExpiringAction} = require('../moderationActions');
const {Op} = require('sequelize');
const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
const memberCache = {};

exports.run = async (client) => {
    await updateCache(client);
    const guild = await client.guilds.fetch(client.config.guildID);

    const actions = await client.models['moderation']['ModerationAction'].findAll({
        where:
            {
                expiresOn: {
                    [Op.gt]: new Date()
                }
            }
    });
    for (const action of actions) {
        await planExpiringAction(new Date(action.expiresOn), action, guild);
    }

    const verificationConfig = client.configurations['moderation']['verification'];
    if (!verificationConfig.enabled || !verificationConfig['restart-verification-channel']) return;
    const channel = await client.channels.fetch(verificationConfig['restart-verification-channel']).catch(() => {});
    if (!channel || (channel || {}).type !== 'GUILD_TEXT') return client.logger.error('[moderation] ' + localize('moderation', 'verify-channel-set-but-not-found-or-wrong-type'));
    let message = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id).last();
    if (!message) {
        message = await channel.send(localize('moderation', 'generating-message'));
        await message.pin();
    }
    await message.edit(embedType(verificationConfig['verify-channel-first-message'], {}, {components: [
        {
            type: 'ACTION_ROW',
            components: [
                {
                    type: 'BUTTON',
                    label: '📨 ' + localize('moderation', 'restart-verification-button'),
                    customId: `mod-rvp`,
                    style: 'PRIMARY'
                }
            ]
        }
    ]}));
};

/**
 * Updates the punishment cache
 * @private
 * @param {Client} client
 * @return {Promise<void>}
 */
async function updateCache(client) {
    const moduleConfig = client.configurations['moderation']['config'];
    memberCache['quarantine'] = (await (await client.guilds.fetch(client.guildID)).members.fetch()).filter(m => !!m.roles.cache.get(moduleConfig['quarantine-role-id']));
    memberCache['mute'] = (await (await client.guilds.fetch(client.guildID)).members.fetch()).filter(m => !!m.roles.cache.get(moduleConfig['muterole-id']));
}

module.exports.updateCache = updateCache;
module.exports.memberCache = memberCache;