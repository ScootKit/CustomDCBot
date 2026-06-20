const {DataTypes, Model} = require('sequelize');

module.exports = class TicketV1 extends Model {
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
            }
        }, {
            tableName: 'ticket_Ticketv1',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'TicketV1',
    'module': 'tickets'
};