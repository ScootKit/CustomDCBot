const {DataTypes, Model} = require('sequelize');

module.exports = class AdminToolsTemporaryRoleChange extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            userID: DataTypes.STRING,
            roleID: DataTypes.STRING,
            type: DataTypes.STRING,
            changeDate: DataTypes.STRING
        }, {
            tableName: 'admin_tools-TemporaryRoleChange',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'TemporaryRoleChange',
    'module': 'admin-tools'
};