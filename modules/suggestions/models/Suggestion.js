const {DataTypes, Model} = require('sequelize');

module.exports = class Suggestion extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            suggestion: DataTypes.TEXT,
            messageID: DataTypes.STRING,
            suggesterID: DataTypes.STRING,
            comments: DataTypes.JSON,
            adminAnswer: DataTypes.TEXT
        }, {
            tableName: 'suggestions_Suggestion',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Suggestion',
    'module': 'suggestions'
};