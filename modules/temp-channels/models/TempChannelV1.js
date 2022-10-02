const {DataTypes, Model} = require('sequelize');

module.exports = class TempChannelV1 extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            creatorID: DataTypes.STRING,
            noMicChannel: DataTypes.STRING
        }, {
            tableName: 'temp-channel_TempChannels',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'TempChannelV1',
    'module': 'temp-channels'
};