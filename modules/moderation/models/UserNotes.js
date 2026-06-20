const { DataTypes, Model } = require('sequelize');

module.exports = class UserNotes extends Model {
    static init(sequelize) {
        return super.init({
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            notes: DataTypes.JSON
        }, {
            tableName: 'moderation_UserNotes',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'UserNotes',
    'module': 'moderation'
};