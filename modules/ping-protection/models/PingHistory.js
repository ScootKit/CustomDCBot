const { DataTypes, Model } = require('sequelize');

module.exports = class PingProtectionPingHistory extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            messageUrl: {
                type: DataTypes.STRING,
                allowNull: true
            },
            targetId: {
                type: DataTypes.STRING,
                allowNull: true
            },
            isRole: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            }
        }, {
            tableName: 'ping_protection_history',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'PingHistory',
    module: 'ping-protection'
};