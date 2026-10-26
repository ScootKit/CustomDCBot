const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class PingProtectionUserPingPreference extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                primaryKey: true,
                allowNull: false
            },
            disabledUntil: {
                type: DataTypes.DATE,
                allowNull: false
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