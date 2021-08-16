const {DataTypes, Model} = require('sequelize');

module.exports = class streamer extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            startedAt: DataTypes.DATE
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