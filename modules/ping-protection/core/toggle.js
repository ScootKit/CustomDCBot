/**
 * Logic for protected users to toggle their protection status
 * @module ping-protection
 * @author itskevinnn
 */

const {localize} = require('../../../src/functions/localize');

const toggleLocks = new Set();

const activeTimers = new Map();

function schedulePauseExpiry(client, userId, disabledUntil) {
    const rawUserId = String(userId);
    if (activeTimers.has(rawUserId)) {
        clearTimeout(activeTimers.get(rawUserId));
        activeTimers.delete(rawUserId);
    }

    const delay = new Date(disabledUntil).getTime() - Date.now();
    if (delay <= 0) {
        return;
    }

    // Set a timer to clean up the preference and re-sync AutoMod as soon as it expires
    const timer = setTimeout(async () => {
        activeTimers.delete(rawUserId);
        try {
            const model = client.models['ping-protection']?.['UserPingPreference'];
            if (model) {
                await model.destroy({where: {userId: rawUserId}}).catch(() => {});
            }
            const config = client.configurations['ping-protection']?.['configuration'] || {};
            if (config.enableAutomod) {
                const {syncNativeAutoMod} = require('./moderation');
                await syncNativeAutoMod(client).catch(() => {});
            }
        } catch {
        }
    }, delay);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }
    activeTimers.set(rawUserId, timer);
}

function clearPauseExpiryTimer(userId) {
    const rawUserId = String(userId);
    if (activeTimers.has(rawUserId)) {
        clearTimeout(activeTimers.get(rawUserId));
        activeTimers.delete(rawUserId);
    }
}

// Checks if a target user has currently paused their ping protection
async function isProtectionToggledOff(client, userId) {
    if (!userId) return false;
    const model = client.models['ping-protection']?.['UserPingPreference'];
    if (!model) return false;

    try {
        const rawUserId = String(userId);
        const preference = await model.findOne({where: {userId: rawUserId}});

        if (!preference || !preference.disabledUntil) {
            return false;
        }

        const expiryTime = new Date(preference.disabledUntil).getTime();
        const now = Date.now();

        if (Number.isFinite(expiryTime) && expiryTime > now) {
            return true;
        }

        // Cleanup for expired pause rows and re-sync native automod if needed
        clearPauseExpiryTimer(rawUserId);
        await model.destroy({where: {userId: rawUserId}}).catch(() => {});
        const config = client.configurations['ping-protection']?.['configuration'] || {};
        if (config.enableAutomod) {
            const {syncNativeAutoMod} = require('./moderation');
            await syncNativeAutoMod(client).catch(() => {});
        }
        return false;
    } catch (error) {
        client.logger.warn(localize('ping-protection', 'log-check-preference-failed', {
            u: userId,
            e: error.message
        }));
        return false;
    }
}

// Toggles a user's protection on or off
async function toggleUserProtection(client, member) {
    const userId = member?.user?.id || member?.id;
    if (!member || !userId) {
        return {success: false, reason: 'not-member'};
    }

    const rawUserId = String(userId);

    // Guard against duplicate executions
    if (toggleLocks.has(rawUserId)) {
        return {success: false, reason: 'locked'};
    }
    toggleLocks.add(rawUserId);
    setTimeout(() => toggleLocks.delete(rawUserId), 1500);

    const config = client.configurations['ping-protection']?.['configuration'] || {};

    const isExplicitlyProtected = Array.isArray(config.protectedUsers) &&
        config.protectedUsers.map(String).includes(rawUserId);

    let memberRoleIds = [];
    if (Array.isArray(member.roles)) {
        memberRoleIds = member.roles.map(String);
    } else if (member.roles?.cache) {
        memberRoleIds = [...member.roles.cache.keys()].map(String);
    }

    const hasProtectedRole = Boolean(
        config.protectAllUsersWithProtectedRole &&
        Array.isArray(config.protectedRoles) &&
        memberRoleIds.some(rId => config.protectedRoles.map(String).includes(rId))
    );

    if (!isExplicitlyProtected && !hasProtectedRole) {
        return {success: false, reason: 'not-protected'};
    }

    const model = client.models['ping-protection']?.['UserPingPreference'];
    if (!model) {
        return {success: false, reason: 'no-model'};
    }

    try {
        const pref = await model.findOne({where: {userId: rawUserId}});
        const now = Date.now();

        const {syncNativeAutoMod} = require('./moderation');

        if (pref && pref.disabledUntil) {
            const expiryTime = new Date(pref.disabledUntil).getTime();
            if (Number.isFinite(expiryTime) && expiryTime > now) {
                clearPauseExpiryTimer(rawUserId);
                await model.destroy({where: {userId: rawUserId}});
                if (config.enableAutomod) {
                    await syncNativeAutoMod(client).catch(() => {});
                }
                return {success: true, state: 'enabled'};
            }
        }

        const disabledUntil = new Date(now + 24 * 60 * 60 * 1000);

        await model.upsert({
            userId: rawUserId,
            disabledUntil
        });

        schedulePauseExpiry(client, rawUserId, disabledUntil);

        if (config.enableAutomod) {
            await syncNativeAutoMod(client).catch(() => {});
        }

        return {success: true, state: 'disabled', disabledUntil};
    } catch (error) {
        client.logger.error(localize('ping-protection', 'log-toggle-preference-failed', {
            u: rawUserId,
            e: error.message
        }));
        return {success: false, reason: 'db-error', error: error.message};
    }
}

async function scheduleActiveToggleExpirations(client) {
    const model = client?.models?.['ping-protection']?.['UserPingPreference'];
    if (!model) return;

    try {
        const preferences = await model.findAll();
        for (const pref of preferences) {
            if (pref.userId && pref.disabledUntil) {
                if (new Date(pref.disabledUntil).getTime() <= Date.now()) {
                    await model.destroy({where: {userId: pref.userId}}).catch(() => {});
                } else {
                    schedulePauseExpiry(client, pref.userId, pref.disabledUntil);
                }
            }
        }
    } catch {
    }
}

module.exports = {
    isProtectionToggledOff,
    toggleUserProtection,
    scheduleActiveToggleExpirations
};