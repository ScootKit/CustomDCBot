const {DataTypes, Model} = require('sequelize');

module.exports = class User extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            userID: DataTypes.STRING,
            messageID: DataTypes.STRING,
            timestamp: DataTypes.DATE
        }, {
            tableName: 'welcomer_User',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'User',
    'module': 'welcomer'
};