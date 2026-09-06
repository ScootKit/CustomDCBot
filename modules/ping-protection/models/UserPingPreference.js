const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class PingProtectionUserPingPreference extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true
            },
            disabledUntil: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null
            }
        }, {
            tableName: 'ping_protection_user_preferences',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'UserPingPreference',
    module: 'ping-protection'
};