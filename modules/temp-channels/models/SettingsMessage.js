const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class TempChannelSettingsMessage extends Model {
    static init(sequelize) {
        return super.init({
            channelID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            messageID: DataTypes.STRING
        }, {
            tableName: 'temp-channel_settings_message',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'SettingsMessage',
    'module': 'temp-channels'
};