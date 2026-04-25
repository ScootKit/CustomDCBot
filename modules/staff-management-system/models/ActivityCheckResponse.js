const { DataTypes, Model } = require('sequelize');

module.exports = class StaffManagementActivityCheckResponse extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            activityCheckId: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            }
        }, {
            tableName: 'staff_management_activity_check_responses',
            timestamps: true,
            sequelize,
            indexes: [
                {
                    unique: true,
                    fields: ['activityCheckId', 'userId']
                }
            ]
        });
    }
};

module.exports.config = {
    name: 'ActivityCheckResponse',
    module: 'staff-management-system'
};