const {DataTypes, Model} = require('sequelize');

module.exports = class Poll extends Model {
    static init(sequelize) {
        return super.init({
            messageID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            description: DataTypes.TEXT, // Can start with "[PUBLIC]" to indicate a public poll
            options: DataTypes.TEXT,
            votes: DataTypes.JSON, // {1: ["userIDHere"], 2: ["as"] }
            expiresAt: DataTypes.DATE,
            channelID: DataTypes.STRING,
            maxSelections: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1
            } // Max selections per voter. 0 = unlimited.
        }, {
            tableName: 'polls_Poll',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Poll',
    'module': 'polls'
};