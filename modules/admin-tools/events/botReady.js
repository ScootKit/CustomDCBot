const {scheduleAllTemporaryRoleJobs} = require('../temporaryRoles');

module.exports.run = async function (client) {
    scheduleAllTemporaryRoleJobs(client).then(() => {
    });
};