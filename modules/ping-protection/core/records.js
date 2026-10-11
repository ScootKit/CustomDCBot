/**
 * Database storage, queries, data retention, and deletion logic
 * @module ping-protection
 * @author itskevinnn
 */

const {Op} = require('sequelize');
const {localize} = require('../../../src/functions/localize');
const {parseTimeframeToMs, getDeletionCooldownHours} = require('./localHelpers');

const recentPings = new Set();

async function addPing(client, userId, messageUrl, targetId, isRole, pingType = 'MENTION') {
    const config = client.configurations['ping-protection']['configuration'];
    const duplicateWindow = config.enableAutomod ? 5000 : 2000;
    const debounceKey = `${userId}_${targetId}`;

    // Avoids duplicate mentions being logged in a short time
    if (recentPings.has(debounceKey)) return;
    recentPings.add(debounceKey);
    setTimeout(() => {
        recentPings.delete(debounceKey);
    }, duplicateWindow);

    const recentDuplicate = await client.models['ping-protection']['PingHistory'].findOne({
        where: {
            userId: userId,
            targetId: targetId,
            createdAt: {[Op.gt]: new Date(Date.now() - duplicateWindow)}
        }
    });

    if (recentDuplicate) return;
    await client.models['ping-protection']['PingHistory'].create({
        userId: userId,
        messageUrl: messageUrl || 'Blocked by AutoMod',
        targetId: targetId,
        isRole: isRole,
        pingType: pingType || 'MENTION'
    });
}

async function getPingCountInWindow(client, userId, timeframe, pingType = null) {
    const timeframeMs = parseTimeframeToMs(timeframe);
    const cutoffDate = new Date(Date.now() - timeframeMs);

    const whereClause = {
        userId: userId,
        createdAt: {[Op.gt]: cutoffDate}
    };

    if (pingType === 'MENTION' || pingType === 'REPLY') {
        whereClause.pingType = pingType;
    }

    return await client.models['ping-protection']['PingHistory'].count({
        where: whereClause
    });
}

async function fetchPingHistory(client, userId, page = 1, limit = 5) {
    const offset = (page - 1) * limit;
    const {count, rows} = await client.models['ping-protection']['PingHistory'].findAndCountAll({
        where: {userId: userId},
        order: [['createdAt', 'DESC']],
        limit: limit,
        offset: offset
    });
    return {total: count, history: rows};
}

async function fetchModHistory(client, userId, page = 1, limit = 5) {
    const model = client.models['ping-protection']?.['ModerationLog'];
    if (!model) return {total: 0, history: []};

    try {
        const offset = (page - 1) * limit;
        const {count, rows} = await model.findAndCountAll({
            where: {victimID: userId},
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset
        });
        return {total: count, history: rows};
    } catch (e) {
        client.logger.warn(localize('ping-protection', 'log-fetch-mod-history-failed', {
            u: userId,
            e: e.message
        }));
        return {total: 0, history: []};
    }
}

async function getLeaverStatus(client, userId) {
    return await client.models['ping-protection']['LeaverData'].findByPk(userId);
}

async function markUserAsLeft(client, userId) {
    await client.models['ping-protection']['LeaverData'].upsert({
        userId: userId,
        leftAt: new Date()
    });
}

async function markUserAsRejoined(client, userId) {
    await client.models['ping-protection']['LeaverData'].destroy({
        where: {userId: userId}
    });
}

async function getDeletionCooldown(client, userId) {
    const model = client.models['ping-protection']?.['DeletionCooldown'];
    if (!model) return null;

    const cooldown = await model.findByPk(userId);
    if (!cooldown) return null;
    if (new Date(cooldown.blockedUntil) <= new Date()) {
        await cooldown.destroy().catch(() => {});
        return null;
    }

    return cooldown;
}

async function setDeletionCooldown(client, userId, dataType, deletedBy = null) {
    const model = client.models['ping-protection']?.['DeletionCooldown'];
    if (!model) return null;

    const hours = getDeletionCooldownHours(dataType);
    const blockedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await model.upsert({
        userId,
        blockedUntil,
        lastDeletionType: dataType,
        lastDeletedBy: deletedBy || null
    });

    return blockedUntil;
}

async function executeDataDeletion(client, userId, dataType, olderThanMs = null) {
    const models = client.models['ping-protection'];
    const pingHistoryWhere = {userId};
    const modLogWhere = {victimID: userId};
    const leaverWhere = {userId};

    if (olderThanMs && Number.isFinite(olderThanMs) && olderThanMs > 0) {
        const cutoff = new Date(Date.now() - olderThanMs);
        pingHistoryWhere.createdAt = {[Op.lt]: cutoff};
        modLogWhere.createdAt = {[Op.lt]: cutoff};
        leaverWhere.leftAt = {[Op.lt]: cutoff};
    }

    if (['del_ping_history', 'del_all'].includes(dataType)) {
        await models.PingHistory.destroy({where: pingHistoryWhere});
    }

    if (['del_moderation_history', 'del_all'].includes(dataType)) {
        await models.ModerationLog.destroy({where: modLogWhere});
    }

    if (dataType === 'del_all') {
        await models.LeaverData.destroy({where: leaverWhere});
    }
}

async function deleteAllUserData(client, userId) {
    await executeDataDeletion(client, userId, 'del_all');
    client.logger.info(localize('ping-protection', 'log-data-deletion', {u: userId}));
}

// Enforces data retention policies based on configuration settings
async function enforceRetention(client) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    if (!storageConfig) return;

    if (storageConfig.enablePingHistory) {
        const historyCutoff = new Date();
        const retentionWeeks = storageConfig.pingHistoryRetention || 12;
        historyCutoff.setDate(historyCutoff.getDate() - (retentionWeeks * 7));

        if (storageConfig.deleteAllPingHistoryAfterTimeframe) {
            const usersWithExpiredData = await client.models['ping-protection']['PingHistory'].findAll({
                where: {createdAt: {[Op.lt]: historyCutoff}},
                attributes: ['userId'],
                group: ['userId']
            });

            const userIdsToWipe = usersWithExpiredData.map(entry => entry.userId);
            if (userIdsToWipe.length > 0) {
                await client.models['ping-protection']['PingHistory'].destroy({
                    where: {userId: userIdsToWipe}
                });
            }
        } else {
            await client.models['ping-protection']['PingHistory'].destroy({
                where: {createdAt: {[Op.lt]: historyCutoff}}
            });
        }
    }

    if (storageConfig.modLogRetention) {
        const modCutoff = new Date();
        modCutoff.setMonth(modCutoff.getMonth() - (storageConfig.modLogRetention || 12));
        await client.models['ping-protection']['ModerationLog'].destroy({
            where: {createdAt: {[Op.lt]: modCutoff}}
        });
    }

    if (storageConfig.enableLeaverDataRetention) {
        const leaverCutoff = new Date();
        leaverCutoff.setDate(leaverCutoff.getDate() - (storageConfig.leaverRetention || 1));
        const leaversToDelete = await client.models['ping-protection']['LeaverData'].findAll({
            where: {leftAt: {[Op.lt]: leaverCutoff}}
        });
        for (const leaver of leaversToDelete) {
            await deleteAllUserData(client, leaver.userId);
            await leaver.destroy();
        }
    }
}

module.exports = {
    addPing,
    getPingCountInWindow,
    fetchPingHistory,
    fetchModHistory,
    getLeaverStatus,
    markUserAsLeft,
    markUserAsRejoined,
    getDeletionCooldown,
    setDeletionCooldown,
    executeDataDeletion,
    deleteAllUserData,
    enforceRetention
};