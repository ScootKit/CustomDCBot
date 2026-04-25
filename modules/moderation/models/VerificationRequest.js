const {DataTypes, Model} = require('sequelize');

module.exports = class VerificationRequest extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            userID: {
                type: DataTypes.STRING,
                allowNull: false
            },
            type: {
                type: DataTypes.STRING,
                allowNull: false
            },
            status: {
                type: DataTypes.STRING,
                defaultValue: 'pending'
            },
            attempts: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            lastAttemptAt: {
                type: DataTypes.DATE,
                allowNull: true
            },
            logMessageID: {
                type: DataTypes.STRING,
                allowNull: true
            }
        }, {
            tableName: 'moderation_VerificationRequests',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'VerificationRequest',
    'module': 'moderation'
};
