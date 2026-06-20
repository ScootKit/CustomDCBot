const {DataTypes, Model} = require('sequelize');

module.exports = class Role extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            userID: DataTypes.STRING,
            roleID: DataTypes.STRING,
            name: DataTypes.STRING,
            color: DataTypes.STRING,
            timestamp: DataTypes.DATE
        }, {
            tableName: 'colorme_Role',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Role',
    'module': 'color-me'
};