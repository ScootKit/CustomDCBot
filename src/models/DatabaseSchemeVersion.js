const {DataTypes, Model} = require('sequelize');

module.exports = class DatabaseSchemeVersion extends Model {
    static init(sequelize) {
        return super.init({
            model: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            version: DataTypes.STRING
        }, {
            tableName: 'system_DatabaseSchemeVersion',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'DatabaseSchemeVersion'
};