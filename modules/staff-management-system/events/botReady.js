const schedule = require('node-schedule');
const { localize } = require('../../../src/functions/localize');
const { Op } = require('sequelize');
const {
    migrationStart,
    migrationEnd
} = require('../../../main');
const {scheduleStatusExpiry} = require('../commands/staff-status.js');
const { initActivityCheckAutomation } = require('../staff-management');
const suspension_check_job = 'staff-management-checks';

module.exports.run = async (client) => {
    const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({
        where: {
            model: 'staff-management-system_ActivityCheck',
            version: 'V1'
        }
    });

    if (!dbVersion) {
        migrationStart();
        try {
            client.logger.info('[staff-management-system] Running V1 migration (adding initiatorId and isAutomated)...');

            const data = await client.models['staff-management-system']['ActivityCheck'].findAll({
                attributes: [
                    'id',
                    'messageId',
                    'channelId',
                    'endTime',
                    'targetRoles',
                    'respondedUsers',
                    'status',
                    'createdAt',
                    'updatedAt'
                ]
            });

            await client.models['staff-management-system']['ActivityCheck'].sync({ force: true });

            for (const row of data) {
                await client.models['staff-management-system']['ActivityCheck'].create({
                    id: row.id,
                    messageId: row.messageId,
                    channelId: row.channelId,
                    endTime: row.endTime,
                    targetRoles: row.targetRoles,
                    respondedUsers: row.respondedUsers,
                    status: row.status,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    initiatorId: null,
                    isAutomated: false
                });
            }

            client.logger.info('[staff-management-system] V1 migration complete.');
            await client.models['DatabaseSchemeVersion'].create({
                model: 'staff-management-system_ActivityCheck',
                version: 'V1'
            });
        } finally {
            migrationEnd();
        }
    }

    const guild = client.guilds.cache.get(client.guildID);
    try {
        const LoaRequest = client.models['staff-management-system']['LoaRequest'];
        const activeRequests = await LoaRequest.findAll({
            where: { status: 'APPROVED' }
        });

        for (const req of activeRequests) {
            scheduleStatusExpiry(client, req);
        }
    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-sched-fail', {
            error: e.message
        }));
    }

    if (guild) {
        try {
            await checkExpiredSuspensions(client, guild);
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-err-exp-susp', {
                error: e.message
            }));
        }
    }

    try {
        initActivityCheckAutomation(client);
    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-sched-fail', {
            error: e.message
        }));
    }

    const existingJob = schedule.scheduledJobs[suspension_check_job];
    if (existingJob) existingJob.cancel();

    schedule.scheduleJob(suspension_check_job, '0 * * * *', async () => {
        if (!client.botReadyAt) return;

        const guild = client.guilds.cache.get(client.guildID);
        if (!guild) return;

        try {
            await checkExpiredSuspensions(client, guild);
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-err-exp-susp', {
                error: e.message
            }));
        }
    });
};

async function checkExpiredSuspensions(client, guild) {
    const Infraction = client.models['staff-management-system']['Infraction'];
    const StaffProfile = client.models['staff-management-system']['StaffProfile'];
    const config = client.configurations['staff-management-system']['infractions'];
    const now = new Date();

    const expiredSuspensions = await Infraction.findAll({
        where: {
            type: 'Suspension',
            active: true,
            expiresAt: {
                [Op.not]: null,
                [Op.lte]: now
            }
        }
    });

    for (const susp of expiredSuspensions) {
        const member = await guild.members.fetch(susp.userId).catch(() => null);
        const profile = await StaffProfile.findByPk(susp.userId);

        try {
            let rolesToRestore = [];

            if (profile?.suspendedRoles) {
                try {
                    const parsed = JSON.parse(profile.suspendedRoles);
                    if (Array.isArray(parsed)) rolesToRestore = parsed;
                } catch (e) {
                    client.logger.warn(
                        `[Staff Management] Failed to parse suspendedRoles for ${susp.userId}: ${e.message}`
                    );
                }
            }

            if (member) {
                if (rolesToRestore.length > 0) {
                    await member.roles.add(rolesToRestore).catch(e => {
                        client.logger.warn(
                            `Failed to restore roles for ${member.user.tag}: ${e.message}`
                        );
                    });
                }

                if (config.suspensionRole) {
                    await member.roles.remove(config.suspensionRole).catch(() => {});
                }
            }

            await susp.update({ active: false });

            if (profile) {
                await profile.update({
                    isSuspended: false,
                    suspendedRoles: null
                });
            }

            if (member) {
                client.logger.info(localize('staff-management-system', 'log-susp-end', {
                    tag: member.user.tag
                }));
            }
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-susp-err', {
                error: e.message
            }));
        }
    }
}