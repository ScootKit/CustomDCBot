const { DataTypes, Model } = require('sequelize');

module.exports = class User extends Model {
    static init(sequelize) {
        return super.init({
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            nickname: DataTypes.JSON
        }, {
            tableName: 'nicknames_User',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'User',
    'module': 'nickname'
};