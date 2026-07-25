const {
    DataTypes,
    Model
} = require('sequelize');

/*
 * Named EconomyLiveMessage (not LiveMessage) because sequelize registers models globally by class
 * name: a second class with the same name would replace this one and db.sync() would never create
 * this table.
 */
module.exports = class EconomyLiveMessage extends Model {
    static init(sequelize) {
        return super.init({
            type: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            channelID: DataTypes.STRING,
            messageID: DataTypes.STRING
        }, {
            tableName: 'economy_liveMessage',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'LiveMessage',
    'module': 'economy-system'
};