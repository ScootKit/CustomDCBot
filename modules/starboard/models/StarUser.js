const {DataTypes, Model} = require('sequelize');

module.exports = class StarUser extends Model {
    static init(sequelize) {
        return super.init({
            userId: DataTypes.STRING,
            msgId: DataTypes.STRING
        }, {
            tableName: 'starboard_StarUser',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'StarUser',
    'module': 'starboard'
};
