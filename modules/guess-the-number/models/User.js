const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class GuessTheNumberUser extends Model {
    static init(sequelize) {
        return super.init({
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            wins: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            totalGuesses: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            }
        }, {
            tableName: 'guess_the_number_Users',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'User',
    'module': 'guess-the-number'
};