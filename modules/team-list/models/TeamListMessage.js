const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class TeamListMessage extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            channelID: DataTypes.STRING,
            messageID: DataTypes.STRING,
            configIndex: DataTypes.INTEGER
        }, {
            tableName: 'team-list_message',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'TeamListMessage',
    'module': 'team-list'
};
