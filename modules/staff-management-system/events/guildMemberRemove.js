const { Op } = require('sequelize');
const { localize } = require('../../../src/functions/localize');

module.exports.run = async (client, member) => {
    if (member.guild.id !== client.guildID) return;

    const StaffShift = client.models['staff-management-system']['StaffShift'];
    const StaffProfile = client.models['staff-management-system']['StaffProfile'];

    try {
        const profile = await StaffProfile.findByPk(member.id);
        const openShifts = await StaffShift.findAll({
            where: {
                userId: member.id,
                endTime: null
            }
        });

        for (const openShift of openShifts) {
            const now = new Date();
            let effectiveStart = new Date(openShift.startTime);

            if (profile?.onBreak && profile.breakStartTime) {
                const breakStartedAt = new Date(profile.breakStartTime);
                if (!Number.isNaN(breakStartedAt.getTime()) && breakStartedAt <= now) {
                    effectiveStart = new Date(
                        effectiveStart.getTime() + (now.getTime() - breakStartedAt.getTime())
                    );
                }
            }

            const duration = Math.max(0, Math.floor((now.getTime() - effectiveStart.getTime()) / 1000));

            await openShift.update({
                endTime: now,
                duration
            });
        }

        await StaffProfile.update(
            {
                onDuty: false,
                onBreak: false,
                breakStartTime: null
            },
            { where: { userId: member.id } }
        );

    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-leave-err', { error: e.message }));
    }
};