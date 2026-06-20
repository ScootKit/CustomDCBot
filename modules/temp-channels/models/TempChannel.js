const {DataTypes, Model} = require('sequelize');

module.exports = class TempChannel extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            creatorID: DataTypes.STRING,
            noMicChannel: DataTypes.STRING,
            allowedUsers: DataTypes.STRING,
            isPublic: DataTypes.BOOLEAN,
            archivedAt: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null
            }
        }, {
            tableName: 'temp-channel_TempChannelsv2',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'TempChannel',
    'module': 'temp-channels'
};