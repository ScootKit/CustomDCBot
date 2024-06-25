const {DataTypes, Model} = require('sequelize');

module.exports = class ShopItems extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            name: DataTypes.STRING,
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