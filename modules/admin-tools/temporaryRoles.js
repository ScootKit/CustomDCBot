const {scheduleJob} = require('node-schedule');
const {localize} = require('../../src/functions/localize');
const jobCache = new Map();

module.exports.scheduleAllTemporaryRoleJobs = async function (client) {
    jobCache.clear();
    const temporaryRoleActions = await client.models['admin-tools']['TemporaryRoleChange'].findAll();
    for (const role of temporaryRoleActions) planTemporaryRoleChangeAction(client, role);
};

module.exports.createTemporaryRoleChangeAction = async function (client, type, changeDate, roleID, userID) {
    const duplicate = await client.models['admin-tools']['TemporaryRoleChange'].findOne({
        where: {
            userID,
            roleID
        }
    });
    if (duplicate) {
        duplicate.destroy();
        if (jobCache.has(duplicate.id)) jobCache.get(duplicate.id).cancel();
    }
    const res = await client.models['admin-tools']['TemporaryRoleChange'].create({
        userID,
        roleID,
        changeDate: changeDate.getTime(),
        type
    });
    planTemporaryRoleChangeAction(client, res);
};

function planTemporaryRoleChangeAction(client, changeItem) {
    const job = scheduleJob(new Date(parseInt(changeItem.changeDate)), async () => {
        doChange().then(() => {
        });
    });

    async function doChange() {
        await changeItem.destroy();
        const member = await client.guild.members.fetch(changeItem.userID).catch(() => {
        });
        if (!member) return;
        await member.roles[changeItem.type](changeItem.roleID, localize('admin-tools', `audit-log-temporary-${changeItem.type}`));
    }

    if (!job) {
        doChange().then(() => {
        });
        return;
    }
    jobCache.set(changeItem.id, job);
    client.jobs.push(job);
}