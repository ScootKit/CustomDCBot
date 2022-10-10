const {DataTypes, Model} = require('sequelize');

module.exports = class TicketMessage extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            messageID: DataTypes.STRING,
            channelID: DataTypes.STRING,
            type: DataTypes.STRING
        }, {
            tableName: 'ticket_Messagev1',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'TicketMessage',
    'module': 'tickets'
};