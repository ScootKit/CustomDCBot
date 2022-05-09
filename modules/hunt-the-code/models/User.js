const {DataTypes, Model} = require('sequelize');

module.exports = class HuntTheCodeUser extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            foundCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            foundCodes: {
                type: DataTypes.JSON,
                defaultValue: []
            }
        }, {
            tableName: 'hunt-the-code_User',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'User',
    'module': 'hunt-the-code'
};