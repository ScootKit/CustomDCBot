const {DataTypes, Model} = require('sequelize');

module.exports = class Ticket extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            open: {
                type: DataTypes.STRING,
                defaultValue: true
            },
            userID: DataTypes.STRING,
            channelID: DataTypes.STRING,
            msgLogURL: DataTypes.STRING,
            msgCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            addedUsers: {
                type: DataTypes.JSON,
                defaultValue: []
            },
            type: DataTypes.STRING
        }, {
            tableName: 'ticket_Ticketv2',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Ticket',
    'module': 'tickets'
};