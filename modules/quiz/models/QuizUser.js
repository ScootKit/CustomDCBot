const {DataTypes, Model} = require('sequelize');

module.exports = class QuizUser extends Model {
    static init(sequelize) {
        return super.init({
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            xp: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            dailyXp: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            dailyQuiz: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            }
        }, {
            tableName: 'quiz_users',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'QuizUser',
    'module': 'quiz'
};
