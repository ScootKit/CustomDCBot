const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementProfile extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                primaryKey: true,
                allowNull: false
            },
            points: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            onDuty: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            lastClockIn: {
                type: DataTypes.DATE,
                allowNull: true
            },
            activityStatus: {
                type: DataTypes.STRING,
                defaultValue: 'ACTIVE'
            },
            isSuspended: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            suspendedRoles: {
                type: DataTypes.TEXT, 
                allowNull: true
            },
            customNickname: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            customIntro: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            onBreak: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            breakStartTime: {
                type: DataTypes.DATE,
                allowNull: true
            }
        }, {
            tableName: 'staff_management_profiles',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'StaffProfile',
    module: 'staff-management-system'
};