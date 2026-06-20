const { DataTypes, Model } = require('sequelize');

module.exports = class AFKUser extends Model {
    static init(sequelize) {
        return super.init({
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            afkMessage: DataTypes.TEXT,
            nickname: DataTypes.STRING,
            autoEnd: {
                type: DataTypes.BOOLEAN,
                defaultValue: true
            }
        }, {
            tableName: 'afk-system_AFKUserV2',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'AFKUser',
    'module': 'afk-system'
};