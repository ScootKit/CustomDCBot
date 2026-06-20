/*
 * `localize` is required lazily inside functions that need it, so this module
 * stays unit-testable without triggering main.js via locales/localize.js.
 */

const recentReadds = new Set();
const watchdogTimers = new Map();
const pendingDebounces = new Map();

/**
 * @private
 * @param {Object} client
 * @returns {boolean}
 */
function moderationEnabled(client) {
    return !!(client.modules && client.modules.moderation && client.modules.moderation.enabled);
}

/**
 * @private
 * @param {Object} client
 * @param {String} key Top-level key under client.configurations.moderation
 * @returns {Object|null}
 */
function moderationConfig(client, key) {
    if (!moderationEnabled(client)) return null;
    return (client.configurations && client.configurations.moderation && client.configurations.moderation[key]) || null;
}

/**
 * Returns true when the member must NOT receive welcome roles from the base-role flow.
 * @param {Object} member discord.js GuildMember (or test stub)
 * @param {Object} client discord.js Client (or test stub)
 * @returns {Promise<boolean>}
 */
async function isInHoldingState(member, client) {
    if (member.user && member.user.bot) return true;

    const welcomerConfig = client.configurations.welcomer.config;
    if (member.pending && !welcomerConfig['assign-roles-immediately']) return true;

    if (moderationEnabled(client)) {
        const modConfig = moderationConfig(client, 'config');
        const quarantineRoleID = modConfig && modConfig['quarantine-role-id'];
        if (quarantineRoleID && member.roles.cache.has(quarantineRoleID)) return true;

        const QuarantineState = client.models && client.models.moderation && client.models.moderation.QuarantineState;
        if (QuarantineState) {
            const row = await QuarantineState.findByPk(member.id).catch(() => null);
            if (row) return true;
        }

        const joinGate = moderationConfig(client, 'joinGate');
        if (joinGate && joinGate.enabled && joinGate.action === 'give-role' && joinGate.roleID && member.roles.cache.has(joinGate.roleID)) return true;

        const antiJoinRaid = moderationConfig(client, 'antiJoinRaid');
        if (antiJoinRaid && antiJoinRaid.enabled && antiJoinRaid.action === 'give-role' && antiJoinRaid.roleID && member.roles.cache.has(antiJoinRaid.roleID)) return true;
    }

    return false;
}

/**
 * Decides what (if anything) should happen for a single member under the base-role policy.
 * @param {Object} member
 * @param {Object} client
 * @returns {Promise<{skip: boolean, missingRoleIDs: string[]}>}
 */
async function evaluateMember(member, client) {
    if (await isInHoldingState(member, client)) return {skip: true, missingRoleIDs: []};
    const roleIDs = client.configurations.welcomer.config['give-roles-on-join'] || [];
    const missingRoleIDs = roleIDs.filter(id => !member.roles.cache.has(id));
    return {skip: false, missingRoleIDs};
}

/**
 * Iterates the cached members and grants missing join roles to anyone not in a holding state.
 * Called from the daily schedule and the 60s post-botReady initial sweep.
 * @param {Object} client
 * @returns {Promise<{scanned:number, granted:number, skipped:number, failed:number}|undefined>}
 */
async function runSync(client) {
    const welcomerConfig = client.configurations.welcomer.config;
    if (!welcomerConfig['treat-welcome-roles-as-base-roles']) return;
    const roleIDs = welcomerConfig['give-roles-on-join'] || [];
    if (roleIDs.length === 0) return;

    const members = client.guild ? client.guild.members.cache : null;
    if (!members) return;

    const {localize} = require('../../src/functions/localize');
    const counts = {scanned: 0, granted: 0, skipped: 0, failed: 0};
    client.logger.info(localize('welcomer', 'base-role-sync-start', {c: members.size}));

    for (const member of members.values()) {
        counts.scanned++;
        let evaluation;
        try {
            evaluation = await evaluateMember(member, client);
        } catch (e) {
            counts.failed++;
            client.logger.warn(`[welcomer/base-role-sync] evaluateMember failed for ${member.id}: ${e && e.message ? e.message : String(e)}`);
            continue;
        }
        if (evaluation.skip || evaluation.missingRoleIDs.length === 0) {
            counts.skipped++;
            continue;
        }
        try {
            await member.roles.add(evaluation.missingRoleIDs, localize('welcomer', 'base-role-audit-reason'));
            counts.granted++;
        } catch (e) {
            counts.failed++;
            const sentryId = client.captureException ? client.captureException(e, {
                module: 'welcomer',
                phase: 'base-role-sync',
                userID: member.id,
                roleIDs: evaluation.missingRoleIDs
            }) : null;
            client.logger.error(localize('welcomer', 'assign-role-failed', {
                u: member.id,
                r: evaluation.missingRoleIDs.join(', '),
                e: (e && e.message) ? e.message : String(e)
            }) + (sentryId ? ` [Sentry: ${sentryId}]` : ''));
        }
    }

    client.logger.info(localize('welcomer', 'base-role-sync-done', {
        s: counts.scanned,
        g: counts.granted,
        k: counts.skipped,
        f: counts.failed
    }));
    return counts;
}

const {AuditLogEvent} = require('discord-api-types/v10');

const DEBOUNCE_MS = 1500;
const LOOP_GUARD_MS = 5000;
const WATCHDOG_MS = 5000;
const AUDIT_LOG_LOOKBACK_MS = 10_000;

/**
 * Fetches recent MemberRoleUpdate audit entries that removed at least one of the given role IDs
 * from this member within the lookback window. Returns most-recent-first.
 * @private
 * @param {Object} guild
 * @param {string} memberID
 * @param {string[]} roleIDs
 * @returns {Promise<Array>}
 */
async function fetchRecentJoinRoleRemovals(guild, memberID, roleIDs) {
    const audit = await guild.fetchAuditLogs({type: AuditLogEvent.MemberRoleUpdate, limit: 5}).catch(() => null);
    if (!audit) return [];
    const cutoff = Date.now() - AUDIT_LOG_LOOKBACK_MS;
    const matches = [];
    for (const entry of audit.entries.values()) {
        if (!entry.target || entry.target.id !== memberID) continue;
        if (entry.createdTimestamp < cutoff) continue;
        if (!Array.isArray(entry.changes)) continue;
        const removesJoinRole = entry.changes.some(c => c.key === '$remove' && Array.isArray(c.new) && c.new.some(r => roleIDs.includes(r.id)));
        if (removesJoinRole) matches.push(entry);
    }
    return matches;
}

/**
 * Schedules a 5-second watchdog after a successful re-add so we can revert if a quarantine
 * role appears post-grant (worst-case race that audit-log + holding-state checks couldn't catch).
 * @private
 * @param {Object} client
 * @param {Object} member
 * @param {string[]} grantedRoleIDs
 */
function startWatchdog(client, member, grantedRoleIDs) {
    const quarantineRoleID = (moderationConfig(client, 'config') || {})['quarantine-role-id'];
    if (!quarantineRoleID) return;

    const memberID = member.id;
    if (watchdogTimers.has(memberID)) {
        clearTimeout(watchdogTimers.get(memberID).timer);
    }
    const state = {
        timer: setTimeout(() => {
            watchdogTimers.delete(memberID);
        }, WATCHDOG_MS),
        quarantineRoleID,
        grantedRoleIDs,
        deadline: Date.now() + WATCHDOG_MS
    };
    watchdogTimers.set(memberID, state);
}

/**
 * If a watchdog is active for this member and the new state shows the quarantine role appeared,
 * remove the join roles we just re-added.
 * @param {Object} client
 * @param {Object} oldMember
 * @param {Object} newMember
 * @returns {Promise<void>}
 */
async function checkWatchdog(client, oldMember, newMember) {
    const state = watchdogTimers.get(newMember.id);
    if (!state) return;
    if (Date.now() > state.deadline) {
        watchdogTimers.delete(newMember.id);
        clearTimeout(state.timer);
        return;
    }
    const hadQuarantine = oldMember.roles.cache.has(state.quarantineRoleID);
    const hasQuarantine = newMember.roles.cache.has(state.quarantineRoleID);
    if (!hadQuarantine && hasQuarantine) {
        clearTimeout(state.timer);
        watchdogTimers.delete(newMember.id);
        const {localize} = require('../../src/functions/localize');
        client.logger.warn(localize('welcomer', 'base-role-watchdog-revert', {u: newMember.id}));
        await newMember.roles.remove(state.grantedRoleIDs, localize('welcomer', 'base-role-audit-reason')).catch(() => {
        });
    }
}

/**
 * Reacts to a guildMemberUpdate where one of the configured join roles was removed. Re-adds the
 * role after a debounce, unless the member is in a holding state or the removal was bot-driven.
 * @param {Object} client
 * @param {Object} oldMember
 * @param {Object} newMember
 * @returns {Promise<void>}
 */
async function handleRoleRemoval(client, oldMember, newMember) {
    const welcomerConfig = client.configurations.welcomer.config;
    if (!welcomerConfig['treat-welcome-roles-as-base-roles']) return;
    const joinRoleIDs = welcomerConfig['give-roles-on-join'] || [];
    if (joinRoleIDs.length === 0) return;

    const removed = joinRoleIDs.filter(id => oldMember.roles.cache.has(id) && !newMember.roles.cache.has(id));
    if (removed.length === 0) return;

    if (recentReadds.has(newMember.id)) return;
    if (pendingDebounces.has(newMember.id)) return;

    if (await isInHoldingState(newMember, client)) return;

    const {localize} = require('../../src/functions/localize');
    const timer = setTimeout(async () => {
        pendingDebounces.delete(newMember.id);
        try {
            const fresh = await newMember.guild.members.fetch({user: newMember.id, force: true}).catch(() => null);
            if (!fresh) return;

            if (await isInHoldingState(fresh, client)) return;

            const stillMissing = joinRoleIDs.filter(id => !fresh.roles.cache.has(id));
            if (stillMissing.length === 0) return;

            const removalEntries = await fetchRecentJoinRoleRemovals(fresh.guild, fresh.id, joinRoleIDs);
            if (removalEntries.some(e => e.executor && e.executor.id === client.user.id)) return;

            let actor = 'unknown';
            const attributable = removalEntries.find(e => e.executor);
            if (attributable) {
                const ex = attributable.executor;
                actor = `${ex.tag || ex.username || ex.id} (${ex.id})`;
            }

            await fresh.roles.add(stillMissing, localize('welcomer', 'base-role-audit-reason'));
            recentReadds.add(fresh.id);
            setTimeout(() => recentReadds.delete(fresh.id), LOOP_GUARD_MS);
            startWatchdog(client, fresh, stillMissing);

            client.logger.info(localize('welcomer', 'base-role-re-added', {
                u: fresh.id,
                r: stillMissing.join(', '),
                a: actor
            }));
        } catch (e) {
            const sentryId = client.captureException ? client.captureException(e, {
                module: 'welcomer',
                phase: 'base-role-re-add',
                userID: newMember.id
            }) : null;
            client.logger.error(localize('welcomer', 'assign-role-failed', {
                u: newMember.id,
                r: joinRoleIDs.join(', '),
                e: (e && e.message) ? e.message : String(e)
            }) + (sentryId ? ` [Sentry: ${sentryId}]` : ''));
        }
    }, DEBOUNCE_MS);

    pendingDebounces.set(newMember.id, timer);
}

/**
 * Returns the IDs of currently-configured holding roles (quarantine, JoinGate, anti-raid) that
 * apply in this server. Only includes roles whose owning feature is enabled and uses `give-role`.
 * @private
 * @param {Object} client
 * @returns {string[]}
 */
function getHoldingRoleIDs(client) {
    const ids = [];
    if (!moderationEnabled(client)) return ids;
    const modConfig = moderationConfig(client, 'config');
    if (modConfig && modConfig['quarantine-role-id']) ids.push(modConfig['quarantine-role-id']);
    const joinGate = moderationConfig(client, 'joinGate');
    if (joinGate && joinGate.enabled && joinGate.action === 'give-role' && joinGate.roleID) ids.push(joinGate.roleID);
    const antiJoinRaid = moderationConfig(client, 'antiJoinRaid');
    if (antiJoinRaid && antiJoinRaid.enabled && antiJoinRaid.action === 'give-role' && antiJoinRaid.roleID) ids.push(antiJoinRaid.roleID);
    return ids;
}

/**
 * Reacts to a guildMemberUpdate where a holding role (quarantine / JoinGate / anti-raid) was
 * removed. If the member is no longer in any holding state and is missing join roles, grant them.
 * @param {Object} client
 * @param {Object} oldMember
 * @param {Object} newMember
 * @returns {Promise<void>}
 */
async function handleHoldingRelease(client, oldMember, newMember) {
    const welcomerConfig = client.configurations.welcomer.config;
    if (!welcomerConfig['treat-welcome-roles-as-base-roles']) return;
    const joinRoleIDs = welcomerConfig['give-roles-on-join'] || [];
    if (joinRoleIDs.length === 0) return;

    const holdingIDs = getHoldingRoleIDs(client);
    if (holdingIDs.length === 0) return;

    const released = holdingIDs.some(id => oldMember.roles.cache.has(id) && !newMember.roles.cache.has(id));
    if (!released) return;

    if (await isInHoldingState(newMember, client)) return;

    const missing = joinRoleIDs.filter(id => !newMember.roles.cache.has(id));
    if (missing.length === 0) return;

    const {localize} = require('../../src/functions/localize');
    try {
        await newMember.roles.add(missing, localize('welcomer', 'base-role-audit-reason'));
        client.logger.info(localize('welcomer', 'base-role-re-added', {
            u: newMember.id,
            r: missing.join(', '),
            a: 'holding-release'
        }));
    } catch (e) {
        const sentryId = client.captureException ? client.captureException(e, {
            module: 'welcomer',
            phase: 'base-role-holding-release',
            userID: newMember.id
        }) : null;
        client.logger.error(localize('welcomer', 'assign-role-failed', {
            u: newMember.id,
            r: missing.join(', '),
            e: (e && e.message) ? e.message : String(e)
        }) + (sentryId ? ` [Sentry: ${sentryId}]` : ''));
    }
}

module.exports = {
    isInHoldingState,
    evaluateMember,
    runSync,
    handleRoleRemoval,
    checkWatchdog,
    handleHoldingRelease,
    _state: {recentReadds, watchdogTimers, pendingDebounces}
};
