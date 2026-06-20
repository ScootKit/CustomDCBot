const {DataTypes, Model} = require('sequelize');

module.exports = class TwitchStreamer extends Model {
    static init(sequelize) {
        return super.init({
            name: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            startedAt: DataTypes.STRING
        }, {
            tableName: 'twitch_streamers',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'streamer',
    'module': 'twitch-notifications'
};