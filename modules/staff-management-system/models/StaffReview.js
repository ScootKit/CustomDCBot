const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementReview extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            targetId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            authorId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            stars: {
                type: DataTypes.INTEGER,
                allowNull: false,
                validate: { min: 1, max: 5 }
            },
            comment: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            messageUrl: {
                type: DataTypes.STRING,
                allowNull: true
            }
        }, {
            tableName: 'staff_management_reviews',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'StaffReview',
    module: 'staff-management-system'
};