const {memberCache} = require('./botReady');
const {moderationAction} = require('../moderationActions');
const {localize} = require('../../../src/functions/localize');
const Captcha = require('@haileybot/captcha-generator');
const {embedType} = require('../../../src/functions/helpers');

let joinCache = [];

exports.run = async (client, guildMember) => {
    if (guildMember.guild.id !== client.config.guildID) return;
    const moduleConfig = client.configurations['moderation']['config'];

    // Anti-Punishment-Bypass
    if (!!memberCache.mute.get(guildMember.user.id)) await guildMember.roles.add(moduleConfig['muterole-id'], `[moderation] ${localize('moderation', 'restored-punishment-audit-log-reason')}`);
    if (!!memberCache.quarantine.get(guildMember.user.id)) await guildMember.roles.add(moduleConfig['quarantine-role-id'], `[moderation] ${localize('moderation', 'restored-punishment-audit-log-reason')}`);

    // Anti-Join-Raid
    const antiJoinRaidConfig = client.configurations['moderation']['antiJoinRaid'];
    if (antiJoinRaidConfig.enabled) {
        const timestamp = new Date().getTime();
        joinCache.push({
            id: guildMember.user.id,
            timestamp: timestamp
        });
        setTimeout(() => {
            joinCache = joinCache.filter(e => e.id !== guildMember.user.id && e.timestamp !== timestamp);
        }, antiJoinRaidConfig.timeframe * 60000);

        if (joinCache.length >= antiJoinRaidConfig.maxJoinsInTimeframe) await performJoinRaidAction();

        /**
         * Performs anti-join-raid actions
         * @private
         * @return {Promise<void>}
         */
        async function performJoinRaidAction() {
            for (const join of joinCache.filter(j => j.id !== guildMember.user.id)) {
                const member = await guildMember.guild.members.fetch(join.id).catch(() => {
                });
                if (!member) continue;
                if (antiJoinRaidConfig.action === 'give-role') {
                    if (antiJoinRaidConfig.removeOtherRoles) await member.roles.remove(guildMember.roles.cache, `[moderation] [${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`);
                    await member.roles.add(antiJoinRaidConfig.roleID, `[moderation] [${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`);
                } else {
                    const roles = [];
                    member.roles.cache.forEach(r => roles.push(r.id));
                    await moderationAction(client, antiJoinRaidConfig.action, {user: client.user}, member, `[${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`, {roles: roles});
                }
            }
            if (antiJoinRaidConfig.action === 'give-role') {
                if (antiJoinRaidConfig.removeOtherRoles) {
                    setTimeout(async () => {
                        await guildMember.roles.remove(guildMember.roles.cache, `[moderation] [${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`);
                        await guildMember.roles.add(antiJoinRaidConfig.roleID, `[moderation] [${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`);
                    }, 4000);
                } else await guildMember.roles.add(antiJoinRaidConfig.roleID, `[moderation] [${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`);
                return;
            }
            const roles = [];
            guildMember.roles.cache.forEach(r => roles.push(r.id));
            await moderationAction(client, antiJoinRaidConfig.action, {user: client.user}, guildMember, `[${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`, {roles: roles});
        }
    }

    // JoinGate
    const joinGateConfig = client.configurations['moderation']['joinGate'];
    if (joinGateConfig.enabled) await runJoinGate();

    // Verification
    const verificationConfig = client.configurations['moderation']['verification'];
    if (verificationConfig.enabled) {
        if (guildMember.user.bot) return;
        if (verificationConfig['verification-needed-role'].length !== 0) await guildMember.roles.add(verificationConfig['verification-needed-role'], '[moderation] ' + localize('moderation', 'verification-started'));
        await sendDMPart(verificationConfig, guildMember).catch(() => dmFail());

        /**
         * Sends a backup message for users who have their dms disabled
         * @private
         * @returns {Promise<any>}
         */
        async function dmFail() {
            const channel = await client.channels.fetch(verificationConfig['restart-verification-channel'] || '').catch(() => {
            });
            if (!channel || (channel || {}).type !== 'GUILD_TEXT') return client.logger.error('[moderation] ' + localize('moderation', 'verify-channel-set-but-not-found-or-wrong-type'));
            const m = await channel.send({
                content: localize('moderation', 'dms-not-enabled-ping', {p: guildMember.toString()}),

                components: [
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
                ]
            }
            );
            setTimeout(() => {
                m.delete().then(() => {
                });
            }, 300000);
        }

        if (guildMember.guild.channels.cache.get(verificationConfig['verification-log']) && verificationConfig.type === 'manual') {
            await guildMember.guild.channels.cache.get(verificationConfig['verification-log']).send({
                embeds: [{
                    title: localize('moderation', 'verification'),
                    color: 'GREEN',
                    description: `${localize('moderation', 'user')}: ${guildMember.toString()} (\`${guildMember.user.id}\`)\n${localize('moderation', 'manual-verification-needed')}`
                }],
                components: [
                    {
                        type: 'ACTION_ROW',
                        components: [
                            {
                                type: 'BUTTON',
                                label: '❌ ' + localize('moderation', 'verification-deny'),
                                customId: `mod-ver-d-${guildMember.user.id}`,
                                style: 'DANGER'
                            },
                            {
                                type: 'BUTTON',
                                label: '✅ ' + localize('moderation', 'verification-approve'),
                                customId: `mod-ver-p-${guildMember.user.id}`,
                                style: 'SUCCESS'
                            }
                        ]
                    }
                ]
            });
        }
    }

    /**
     * Runs joingate on this GuildMember
     * @returns {Promise<void>}
     */
    async function runJoinGate() {
        if (guildMember.user.bot && joinGateConfig.ignoreBots) return;
        if (joinGateConfig.allUsers) return performJoinGateAction(localize('moderation', 'joingate-for-everyone'));
        const daysSinceCreation = (new Date().getTime() / 86400000).toFixed(0) - (guildMember.user.createdTimestamp / 86400000).toFixed(0);
        if (daysSinceCreation <= joinGateConfig.minAccountAge) return performJoinGateAction(localize('moderation', 'account-age-to-low', {
            a: daysSinceCreation,
            c: joinGateConfig.minAccountAge
        }));
        if (!guildMember.user.avatarURL() && joinGateConfig.requireProfilePicture) return performJoinGateAction(localize('moderation', 'no-profile-picture'));

        /**
         * Performs the join gate action
         * @private
         * @param {String} reason Reason for executing the join gate action
         * @return {Promise<void>}
         */
        async function performJoinGateAction(reason) {
            guildMember.joinGateTriggered = true;
            if (joinGateConfig.action === 'give-role') {
                if (joinGateConfig.removeOtherRoles) {
                    guildMember.doNotGiveWelcomeRole = true;
                    await guildMember.roles.remove(guildMember.roles.cache, `[moderation] [${localize('moderation', 'join-gate')}] ${localize('moderation', 'join-gate-fail', {r: reason})}`);
                }
                await guildMember.roles.add(joinGateConfig.roleID, `[moderation] [${localize('moderation', 'join-gate')}] ${localize('moderation', 'join-gate-fail', {r: reason})}`);
                return;
            }
            const roles = [];
            guildMember.roles.cache.forEach(r => roles.push(r.id));
            await moderationAction(client, joinGateConfig.action, {user: client.user}, guildMember, `[${localize('moderation', 'join-gate')}] ${localize('moderation', 'join-gate-fail', {r: reason})}`, {roles: roles});
        }
    }
};

/**
 * Sends a user a DM about their verification
 * @param {Object} verificationConfig Configuration of verification
 * @param {GuildMember} guildMember GuildMember to send message to
 * @returns {Promise<unknown>}
 */
async function sendDMPart(verificationConfig, guildMember) {
    return new Promise(async (resolve, reject) => {
        try {
            if (verificationConfig.type === 'manual') await guildMember.user.send(embedType(verificationConfig['manual-verification-message'], {}));
            else {
                const captcha = new Captcha();
                await guildMember.user.send(embedType(verificationConfig['captcha-message'], {}, {
                    files: [
                        {
                            attachment: captcha.PNGStream,
                            name: 'you-call-it-captcha-we-call-it-ai-training.png'
                        }
                    ]
                }));
                const c = await guildMember.user.createDM();
                const col = c.createMessageCollector({time: 120000});
                let p = false;
                let d = null;
                if (guildMember.guild.channels.cache.get(verificationConfig['verification-log'])) {
                    d = await guildMember.guild.channels.cache.get(verificationConfig['verification-log']).send({
                        embeds: [{
                            title: localize('moderation', 'verification'),
                            color: 'GREEN',
                            description: `${localize('moderation', 'user')}: ${guildMember.toString()} (\`${guildMember.user.id}\`)\n${localize('moderation', 'captcha-verification-pending')}`
                        }],
                        components: [
                            {
                                type: 'ACTION_ROW',
                                components: [
                                    {
                                        type: 'BUTTON',
                                        label: '⏭️ ' + localize('moderation', 'verification-skip'),
                                        customId: `mod-ver-p-${guildMember.user.id}`,
                                        style: 'SECONDARY'
                                    }
                                ]
                            }
                        ]
                    });
                    const coli = d.createMessageComponentCollector({time: 120000});
                    coli.on('collect', () => {
                        p = true;
                    });
                    coli.on('end', () => {
                        d.delete();
                    });
                }
                col.on('collect', (m) => {
                    if (m.author.id === guildMember.user.id && !p) {
                        p = true;
                        if (d) d.delete();
                        if (m.content.toUpperCase() === captcha.value.toUpperCase()) verificationPassed(guildMember);
                        else verificationFail(guildMember);
                    }
                });
                col.on('end', () => {
                    if (!p) {
                        d.delete();
                        verificationFail(guildMember);
                    }
                });
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

module.exports.sendDMPart = sendDMPart;

/**
 * User passes verification, gets their roles and message gets send in log-channel
 * @private
 * @param {GuildMember} guildMember Member who passed the verification
 * @returns {Promise<void>}
 */
async function verificationPassed(guildMember) {
    const verificationConfig = guildMember.client.configurations['moderation']['verification'];
    if (verificationConfig['verification-needed-role'].length !== 0) await guildMember.roles.remove(verificationConfig['verification-needed-role'], '[' + localize('moderation', 'verification') + '] ' + localize('moderation', 'verification-completed'));
    if (verificationConfig['verification-passed-role'].length !== 0) await guildMember.roles.add(verificationConfig['verification-passed-role'], '[' + localize('moderation', 'verification') + '] ' + localize('moderation', 'verification-completed'));
    await guildMember.user.send(embedType(verificationConfig['captcha-succeeded-message']));
    if (guildMember.guild.channels.cache.get(verificationConfig['verification-log'])) await guildMember.guild.channels.cache.get(verificationConfig['verification-log']).send({
        embeds: [{
            title: localize('moderation', 'verification'),
            color: 'GREEN',
            description: `${localize('moderation', 'user')}: ${guildMember.toString()} (\`${guildMember.user.id}\`)\n${localize('moderation', 'verification-completed')}`
        }]
    });
}

module.exports.verificationPassed = verificationPassed;

/**
 * User fails verification, gets moderated and message gets send in log-channel
 * @private
 * @param {GuildMember} guildMember Member who failed verification
 * @returns {Promise<void>}
 */
async function verificationFail(guildMember) {
    const verificationConfig = guildMember.client.configurations['moderation']['verification'];
    await guildMember.user.send(embedType(verificationConfig['captcha-failed-message']));
    await moderationAction(guildMember.client, verificationConfig.actionOnFail, guildMember.guild.me, guildMember, '[' + localize('moderation', 'verification') + '] ' + localize('moderation', 'verification-failed'));
    if (guildMember.guild.channels.cache.get(verificationConfig['verification-log'])) await guildMember.guild.channels.cache.get(verificationConfig['verification-log']).send({
        embeds: [{
            title: localize('moderation', 'verification'),
            color: 'GREEN',
            description: `${localize('moderation', 'user')}: ${guildMember.toString()} (\`${guildMember.user.id}\`)\n${localize('moderation', 'verification-failed')}`
        }]
    });
}

module.exports.verificationFail = verificationFail;