const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class LevelsLiveLeaderboard extends Model {
    static init(sequelize) {
        return super.init({
            channelID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            messageID: DataTypes.STRING
        }, {
            tableName: 'levels_liveleaderboard',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'LiveLeaderboard',
    'module': 'levels'
};