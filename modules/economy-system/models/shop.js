const {DataTypes, Model} = require('sequelize');

module.exports = class ShopItems extends Model {
    static init(sequelize) {
        return super.init({
            name: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            price: DataTypes.INTEGER,
            role: DataTypes.TEXT
        }, {
            tableName: 'economy_shop',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Shop',
    'module': 'economy-system'
};