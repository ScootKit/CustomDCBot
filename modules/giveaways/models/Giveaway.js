const {DataTypes, Model} = require('sequelize');

module.exports = class User extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            endAt: {
                type: DataTypes.STRING
            },
            ended: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            prize: DataTypes.STRING,
            winnerCount: DataTypes.INTEGER,
            organiser: DataTypes.STRING,
            messageID: DataTypes.STRING,
            channelID: DataTypes.STRING
        }, {
            tableName: 'giveaways_giveaways',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Giveaway',
    'module': 'giveaways'
};