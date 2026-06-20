const {memberCache} = require('./botReady');
const {moderationAction} = require('../moderationActions');
const {activateLockdown, isLockdownActive} = require('../lockdown');
const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
const {ChannelType, AttachmentBuilder} = require('discord.js');
const {client} = require('../../../main');

let joinCache = [];
let raidActionInProgress = false;

module.exports.run = async (client, guildMember) => {
    if (guildMember.guild.id !== client.config.guildID) return;
    const moduleConfig = client.configurations['moderation']['config'];

    // Anti-Punishment-Bypass
    if (memberCache.quarantine && !!memberCache.quarantine.get(guildMember.user.id)) {
        guildMember.doNotGiveWelcomeRole = true;
        await guildMember.roles.add(moduleConfig['quarantine-role-id'], `[moderation] ${localize('moderation', 'restored-punishment-audit-log-reason')}`);
    }

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

        if (joinCache.length >= antiJoinRaidConfig.maxJoinsInTimeframe && !raidActionInProgress) await performJoinRaidAction();

        /**
         * Performs anti-join-raid actions
         * @private
         * @return {Promise<void>}
         */
        async function performJoinRaidAction() {
            raidActionInProgress = true;
            for (const join of joinCache.filter(j => j.id !== guildMember.user.id)) {
                const member = await guildMember.guild.members.fetch(join.id).catch(() => {
                });
                if (!member) continue;
                if (antiJoinRaidConfig.action === 'give-role') {
                    if (antiJoinRaidConfig.removeOtherRoles) await member.roles.remove(guildMember.roles.cache, `[moderation] [${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`);
                    await member.roles.add(antiJoinRaidConfig.roleID, `[moderation] [${localize('moderation', 'anti-join-raid')}] ${localize('moderation', 'raid-detected')}`);
                } else {
                    const roles = [];
                    member.roles.cache.filter(f => !f.managed).forEach(r => roles.push(r.id));
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
            const lockdownConfig = client.configurations['moderation']['lockdown'];
            if (lockdownConfig && lockdownConfig.enabled && lockdownConfig.autoTriggerOnJoinRaid && !await isLockdownActive(client)) {
                await activateLockdown(client, localize('moderation', 'lockdown-joinraid-trigger'), localize('moderation', 'lockdown-system'), true);
            }
            joinCache = [];
            setTimeout(() => {
                raidActionInProgress = false;
            }, 30000);
        }
    }

    // JoinGate
    const joinGateConfig = client.configurations['moderation']['joinGate'];
    if (joinGateConfig.enabled && !(guildMember.pending && !['kick', 'ban'].includes(joinGateConfig.action))) await runJoinGate(guildMember);

    // Verification
    const verificationConfig = client.configurations['moderation']['verification'];
    if (verificationConfig.enabled) {
        if (guildMember.user.bot) return;
        if (verificationConfig['verification-needed-role'].length !== 0) await guildMember.roles.add(verificationConfig['verification-needed-role'], '[moderation] ' + localize('moderation', 'verification-started'));

        // Only send DMs for legacy captcha-dm type
        if (verificationConfig.type === 'captcha-dm') {
            await sendDMPart(verificationConfig, guildMember).catch(() => dmFail());

            async function dmFail() {
                const channel = await client.channels.fetch(verificationConfig['verification-channel'] || verificationConfig['restart-verification-channel'] || '').catch(() => {
                });
                if (!channel || (channel || {}).type !== ChannelType.GuildText) return client.logger.error('[moderation] ' + localize('moderation', 'verify-channel-set-but-not-found-or-wrong-type'));
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

        }
    }


};

/**
 * Runs joingate on this GuildMember
 * @returns {Promise<void>}
 */
async function runJoinGate(guildMember) {
    const joinGateConfig = client.configurations['moderation']['joinGate'];
    if (guildMember.user.bot && joinGateConfig.ignoreBots) return;
    if (joinGateConfig.allUsers) return performJoinGateAction(localize('moderation', 'joingate-for-everyone'));
    const daysSinceCreation = Math.floor((Date.now() - guildMember.user.createdTimestamp) / 86400000);
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
        } else {
            const roles = [];
            guildMember.roles.cache.forEach(r => roles.push(r.id));
            await moderationAction(client, joinGateConfig.action, {user: client.user}, guildMember, `[${localize('moderation', 'join-gate')}] ${localize('moderation', 'join-gate-fail', {r: reason})}`, {roles: roles});
        }

        const lockdownConfig = client.configurations['moderation']['lockdown'];
        if (lockdownConfig && lockdownConfig.enabled && lockdownConfig.autoTriggerOnJoinGate && !await isLockdownActive(client)) {
            await activateLockdown(client, localize('moderation', 'lockdown-joingate-trigger'), localize('moderation', 'lockdown-system'), true);
        }
    }
}

module.exports.runJoinGate = runJoinGate;

/**
 * Sends a user a DM about their verification
 * @param {Object} verificationConfig Configuration of verification
 * @param {GuildMember} guildMember GuildMember to send message to
 * @returns {Promise<unknown>}
 */
async function sendDMPart(verificationConfig, guildMember) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!guildMember.client.scnxSetup) return guildMember.client.logger.error('[moderation] Captcha Generation is only available if your bot has an SCNX Integration set up.');
            const captcha = await require('../../../src/functions/scnx-integration').generateCaptcha(verificationConfig.captchaLevel);
            await guildMember.user.send(embedType(verificationConfig['captcha-message'], {}, {
                files: [new AttachmentBuilder(captcha.buffer, {name: 'you-call-it-captcha-we-call-it-ai-training.png'})]
            }));
            const c = await guildMember.user.createDM();
            const col = c.createMessageCollector({time: 120000});
            let p = false;
            let d = null;
            let dDeleted = false;
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
                                    customId: `mod-ver-skip-${guildMember.user.id}`,
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
                    if (!dDeleted) {
                        dDeleted = true;
                        d.delete().catch(() => {
                        });
                    }
                });
            }
            col.on('collect', (m) => {
                if (m.author.id === guildMember.user.id && !p) {
                    p = true;
                    if (m.content.toUpperCase() === captcha.solution.toUpperCase()) verificationPassed(guildMember);
                    else {
                        client.logger.log(`${guildMember.user.id} failed verification. Entered: "${m.content.toUpperCase()}", expected: "${captcha.solution.toUpperCase()}"`);
                        verificationFail(guildMember);
                    }
                    if (d && !dDeleted) {
                        dDeleted = true;
                        d.delete().catch(() => {
                        });
                    }
                }
            });
            col.on('end', () => {
                if (!p) {
                    verificationFail(guildMember);
                    if (d && !dDeleted) {
                        dDeleted = true;
                        d.delete().catch(() => {
                        });
                    }
                }
            });
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
async function verificationPassed(guildMember, interaction = null) {
    const verificationConfig = guildMember.client.configurations['moderation']['verification'];
    if (verificationConfig['verification-needed-role'].length !== 0) await guildMember.roles.remove(verificationConfig['verification-needed-role'], '[' + localize('moderation', 'verification') + '] ' + localize('moderation', 'verification-completed'));
    if (verificationConfig['verification-passed-role'].length !== 0) await guildMember.roles.add(verificationConfig['verification-passed-role'], '[' + localize('moderation', 'verification') + '] ' + localize('moderation', 'verification-completed'));
    if (interaction) {
        await interaction.followUp({
            ...embedType(verificationConfig['captcha-succeeded-message']),
            ephemeral: true
        }).catch(() => {
        });
    } else {
        await guildMember.user.send(embedType(verificationConfig['captcha-succeeded-message'])).catch(() => {
        });
    }
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
async function verificationFail(guildMember, interaction = null) {
    const verificationConfig = guildMember.client.configurations['moderation']['verification'];
    if (interaction) {
        await interaction.followUp({
            ...embedType(verificationConfig['captcha-failed-message']),
            ephemeral: true
        }).catch(() => {
        });
    } else {
        await guildMember.user.send(embedType(verificationConfig['captcha-failed-message'])).catch(() => {
        });
    }
    const durationParser = require('parse-duration');
    let expiresAt = null;
    if (['mute', 'quarantine'].includes(verificationConfig.actionOnFail) && verificationConfig.actionOnFailDuration) {
        expiresAt = new Date(new Date().getTime() + durationParser(verificationConfig.actionOnFailDuration));
    }
    await moderationAction(guildMember.client, verificationConfig.actionOnFail, guildMember.guild.members.me, guildMember, '[' + localize('moderation', 'verification') + '] ' + localize('moderation', 'verification-failed'), {}, expiresAt);
    if (guildMember.guild.channels.cache.get(verificationConfig['verification-log'])) await guildMember.guild.channels.cache.get(verificationConfig['verification-log']).send({
        embeds: [{
            title: localize('moderation', 'verification'),
            color: 'RED',
            description: `${localize('moderation', 'user')}: ${guildMember.toString()} (\`${guildMember.user.id}\`)\n${localize('moderation', 'verification-failed')}`
        }]
    });
}

module.exports.verificationFail = verificationFail;