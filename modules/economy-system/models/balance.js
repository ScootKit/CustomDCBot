const {DataTypes, Model} = require('sequelize');

module.exports = class NewEconomyUser extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            balance: DataTypes.INTEGER,
            bank: DataTypes.INTEGER
        }, {
            tableName: 'balance',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'NewBalance',
    'module': 'economy-system'
};