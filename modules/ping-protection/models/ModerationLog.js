const { DataTypes, Model } = require('sequelize');

module.exports = class PingProtectionModerationLog extends Model {
    static init(sequelize) {
        return super.init({
            id: { 
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            victimID: {
                type: DataTypes.STRING,
                allowNull: false
            },
            type: {
                type: DataTypes.STRING,
                allowNull: false
            },
            reason: { 
                type: DataTypes.STRING,
                allowNull: true
            },
            actionDuration: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
        }, {
            tableName: 'ping_protection_mod_log',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'ModerationLog',
    'module': 'ping-protection'
};