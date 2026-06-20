const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementShift extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            startTime: {
                type: DataTypes.DATE,
                allowNull: false
            },
            endTime: {
                type: DataTypes.DATE,
                allowNull: true
            },
            duration: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            type: {
                type: DataTypes.STRING,
                defaultValue: "Staff"
            },
            breakCount: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            }
        }, {
            tableName: 'staff_management_shifts',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'StaffShift',
    module: 'staff-management-system'
};