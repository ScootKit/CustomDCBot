const {DataTypes, Model} = require('sequelize');

module.exports = class LockdownState extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            active: {
                type: DataTypes.BOOLEAN,
                defaultValue: true
            },
            reason: {
                type: DataTypes.STRING,
                allowNull: true
            },
            triggeredBy: {
                type: DataTypes.STRING,
                allowNull: true
            },
            isAutomatic: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            permissionBackup: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: []
            },
            startedAt: {
                type: DataTypes.DATE,
                allowNull: true
            }
        }, {
            tableName: 'moderation_lockdown_state',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'LockdownState',
    'module': 'moderation'
};
