const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementLoaRequest extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            type: {
                type: DataTypes.STRING,
                allowNull: false
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            startDate: {
                type: DataTypes.DATE,
                allowNull: false
            },
            endDate: {
                type: DataTypes.DATE,
                allowNull: false
            },
            status: {
                type: DataTypes.STRING,
                defaultValue: "PENDING"
            },
            approverId: {
                type: DataTypes.STRING,
                allowNull: true
            },
            rejectionReason: {
                type: DataTypes.TEXT,
                allowNull: true
            }
        }, {
            tableName: 'staff_management_loa_requests',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'LoaRequest',
    module: 'staff-management-system'
};