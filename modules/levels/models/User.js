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