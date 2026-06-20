const {planExpiringAction} = require('../moderationActions');
const {Op} = require('sequelize');
const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
const {scheduleJob} = require('node-schedule');
const {ChannelType} = require('discord.js');
const {restoreLockdownState} = require('../lockdown');
const memberCache = {};
const durationParser = require('parse-duration');

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
        if (!action.expiresOn) continue;
        await planExpiringAction(new Date(action.expiresOn), action, guild);
    }

    if (client.configurations['moderation']['config'].warnsExpire) {
        const j = scheduleJob('42 0 * * *', () => {
            deleteExpiredWarns(client).then(() => {
            });
        });
        client.jobs.push(j);
        deleteExpiredWarns(client).then(() => {
        });
    }

    await restoreLockdownState(client);

    const verificationConfig = client.configurations['moderation']['verification'];
    if (!verificationConfig.enabled) return;

    // Support both new and legacy config field name
    const channelId = verificationConfig['verification-channel'] || verificationConfig['restart-verification-channel'];
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => {
    });
    if (!channel || (channel || {}).type !== ChannelType.GuildText) return client.logger.error('[moderation] ' + localize('moderation', 'verify-channel-set-but-not-found-or-wrong-type'));
    let message = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id).last();
    if (!message) {
        message = await channel.send(localize('moderation', 'generating-message'));
        await message.pin();
    }

    const isLegacyDM = verificationConfig.type === 'captcha-dm';
    await message.edit(embedType(verificationConfig['verify-channel-first-message'], {}, {
        components: [
            {
                type: 'ACTION_ROW',
                components: [
                    {
                        type: 'BUTTON',
                        label: isLegacyDM ? ('📨 ' + localize('moderation', 'restart-verification-button')) : ('✅ ' + localize('moderation', 'verify-me-button')),
                        customId: isLegacyDM ? 'mod-rvp' : 'mod-verify',
                        style: 'PRIMARY'
                    }
                ]
            }
        ]
    }));
};

/**
 * Updates the punishment cache
 * @private
 * @param {Client} client
 * @return {Promise<void>}
 */
async function updateCache(client) {
    const moduleConfig = client.configurations['moderation']['config'];
    memberCache['quarantine'] = client.guild.members.cache.filter(m => !!m.roles.cache.get(moduleConfig['quarantine-role-id']));
}

async function deleteExpiredWarns(client) {
    const aD = await client.models['moderation']['ModerationAction'].findAll({
        where: {
            createdAt: {
                [Op.lt]: new Date(new Date().getTime() - durationParser(client.configurations['moderation']['config']['warnExpiration']))
            },
            type: 'warn'
        }
    });
    for (const action of aD) {
        await action.destroy();
    }
    if (aD.length !== 0) client.logger.info(`Deleted ${aD.length} warns because their expired`);
}

module.exports.updateCache = updateCache;
module.exports.memberCache = memberCache;
