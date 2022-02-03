const {DataTypes, Model} = require('sequelize');

module.exports = class ChannelLock extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            permissions: DataTypes.JSON,
            lockReason: DataTypes.STRING
        }, {
            tableName: 'system_ChannelLock',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'ChannelLock'
};