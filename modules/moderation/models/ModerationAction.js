const { DataTypes, Model } = require('sequelize');

module.exports = class ModerationAction extends Model {
    static init(sequelize) {
        return super.init({
            actionID: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            victimID: DataTypes.STRING,
            additionalData: DataTypes.JSON,
            type: DataTypes.STRING,
            memberID: DataTypes.STRING,
            reason: DataTypes.STRING,
            expiresOn: DataTypes.DATE
        }, {
            tableName: 'moderation_ModerationActions3', // v3
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'ModerationAction',
    'module': 'moderation'
};