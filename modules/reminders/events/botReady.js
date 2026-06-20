const {Op} = require('sequelize');
const {planReminder} = require('../reminders');
module.exports.run = async function (client) {
    const reminders = await client.models['reminders']['Reminder'].findAll({
        where: {
            date: {
                [Op.gte]: new Date()
            }
        }
    });
    for (const reminder of reminders) planReminder(client, reminder);
};