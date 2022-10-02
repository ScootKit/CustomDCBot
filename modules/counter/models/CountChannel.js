const {DataTypes, Model} = require('sequelize');

module.exports = class CountChannel extends Model {
    static init(sequelize) {
        return super.init({
            channelID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            currentNumber: DataTypes.INTEGER,
            lastCountedUser: DataTypes.STRING,
            userCounts: {
                type: DataTypes.JSON,
                defaultValue: {}
            }
        }, {
            tableName: 'counter_countChannel',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'CountChannel',
    'module': 'counter'
};