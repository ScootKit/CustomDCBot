const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementPromotion extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            issuerId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            newRole: {
                type: DataTypes.STRING,
                allowNull: false
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            messageUrl: {
                type: DataTypes.STRING,
                allowNull: true
            }
        }, {
            tableName: 'staff_management_promotions',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'Promotion',
    module: 'staff-management-system'
};