const {DataTypes, Model} = require('sequelize');

module.exports = class QuizList extends Model {
    static init(sequelize) {
        return super.init({
            messageID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            description: DataTypes.STRING,
            options: DataTypes.JSON,
            votes: DataTypes.JSON, // {1: ["userIDHere"], 2: ["as"] }
            expiresAt: DataTypes.DATE,
            channelID: DataTypes.STRING,
            canChangeVote: DataTypes.BOOLEAN,
            private: DataTypes.BOOLEAN,
            type: DataTypes.STRING // normal, bool
        }, {
            tableName: 'quiz_Quiz',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'QuizList',
    'module': 'quiz'
};
