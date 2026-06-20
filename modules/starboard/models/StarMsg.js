const {DataTypes, Model} = require('sequelize');

module.exports = class StarMsg extends Model {
    static init(sequelize) {
        return super.init({
            msgId: DataTypes.STRING,
            starMsg: DataTypes.STRING
        }, {
            tableName: 'starboard_StarMsg',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'StarMsg',
    'module': 'starboard'
};
