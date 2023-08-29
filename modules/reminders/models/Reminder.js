const {DataTypes, Model} = require('sequelize');

module.exports = class RemindersReminder extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            userID: {
                type: DataTypes.STRING
            },
            reminderText: DataTypes.STRING,
            channelID: DataTypes.STRING, // set to DM to send a DM
            date: DataTypes.DATE
        }, {
            tableName: 'reminders-reminder',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Reminder',
    'module': 'reminders'
};