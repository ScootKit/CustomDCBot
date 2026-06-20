const {DataTypes, Model} = require('sequelize');

module.exports = class LevelsUser extends Model {
    static init(sequelize) {
        return super.init({
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            xp: {
                type: DataTypes.INTEGER
            },
            messages: {
                type: DataTypes.INTEGER
            },
            level: {
                type: DataTypes.INTEGER,
                defaultValue: 1
            },
            dailyMessages: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            dailyVoiceSeconds: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            dailyResetDate: {
                type: DataTypes.STRING,
                allowNull: true
            }
        }, {
            tableName: 'levels_users',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'User',
    'module': 'levels'
};