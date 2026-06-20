const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class PingProtectionDeletionCooldown extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                primaryKey: true,
                allowNull: false
            },
            blockedUntil: {
                type: DataTypes.DATE,
                allowNull: false
            },
            lastDeletionType: {
                type: DataTypes.STRING,
                allowNull: false
            },
            lastDeletedBy: {
                type: DataTypes.STRING,
                allowNull: true
            }
        }, {
            tableName: 'ping_protection_deletion_cooldowns',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'DeletionCooldown',
    module: 'ping-protection'
};