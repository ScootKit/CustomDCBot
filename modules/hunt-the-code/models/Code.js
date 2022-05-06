const {DataTypes, Model} = require('sequelize');

module.exports = class HuntTheCodeCode extends Model {
    static init(sequelize) {
        return super.init({
            code: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            creatorID: DataTypes.STRING,
            displayName: DataTypes.STRING,
            foundCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            }
        }, {
            tableName: 'hunt-the-code_Code',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Code',
    'module': 'hunt-the-code'
};