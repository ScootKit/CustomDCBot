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
            type: DataTypes.INTEGER,
            memberID: DataTypes.STRING,
            reason: DataTypes.STRING,
            expiresOn: DataTypes.DATE
        }, {
            tableName: 'moderation_ModerationActions2', // 2 because compatibility with old versions
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'ModerationAction',
    'module': 'moderation'
};