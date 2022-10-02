const {DataTypes, Model} = require('sequelize');

module.exports = class WelcomerUser extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            userID: DataTypes.STRING,
            channelID: DataTypes.STRING,
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