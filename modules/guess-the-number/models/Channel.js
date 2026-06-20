const {DataTypes, Model} = require('sequelize');

module.exports = class GuessTheNumberChannel extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            channelID: DataTypes.STRING,
            number: DataTypes.INTEGER,
            min: DataTypes.INTEGER,
            max: DataTypes.INTEGER,
            ownerID: DataTypes.STRING,
            winnerID: DataTypes.STRING,
            ended: DataTypes.BOOLEAN,
            guessCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            }
        }, {
            tableName: 'guess_the_number_Channel',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Channel',
    'module': 'guess-the-number'
};