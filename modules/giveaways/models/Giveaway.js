const {DataTypes, Model} = require('sequelize');

module.exports = class Giveaway extends Model {
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
            requirements: {
                type: DataTypes.JSON,
                defaultValue: []
            },
            countMessages: { // Yeah, I could get that from the requirements, but it's easier to fetch giveaways this way
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            messageCount: DataTypes.JSON,
            entries: {
                type: DataTypes.JSON,
                defaultValue: {}
            },
            sponsorWebsite: DataTypes.STRING,
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