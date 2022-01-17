const {DataTypes, Model} = require('sequelize');

module.exports = class EconomyUser extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            balance: DataTypes.INTEGER
        }, {
            tableName: 'economy_user',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'OldBalance',
    'module': 'economy-system'
};