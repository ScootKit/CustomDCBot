const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementInfraction extends Model {
    static init(sequelize) {
        return super.init({
            caseId: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            issuerId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            type: {
                type: DataTypes.STRING,
                allowNull: false
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            durationDays: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            active: {
                type: DataTypes.BOOLEAN,
                defaultValue: true
            },
            messageUrl: {
                type: DataTypes.STRING,
                allowNull: true
            },
            expiresAt: {
                type: DataTypes.DATE,
                allowNull: true
            }
        }, {
            tableName: 'staff_management_infractions',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'Infraction',
    module: 'staff-management-system'
};