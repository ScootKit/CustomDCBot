const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementActivityCheck extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            messageId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            channelId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            endTime: {
                type: DataTypes.DATE,
                allowNull: false
            },
            targetRoles: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            respondedUsers: {
                type: DataTypes.TEXT,
                defaultValue: '[]'
            },
            status: {
                type: DataTypes.STRING,
                defaultValue: 'ACTIVE'
            },
            initiatorId: {
                type: DataTypes.STRING,
                allowNull: true
            },
            isAutomated: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            }
        }, {
            tableName: 'staff_management_activity_checks',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'ActivityCheck',
    module: 'staff-management-system'
};