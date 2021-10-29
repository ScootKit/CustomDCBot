const {DataTypes, Model} = require('sequelize');

module.exports = class EconomyCooldown extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            command: DataTypes.STRING
        }, {
            tableName: 'economy_cooldowns',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'cooldown',
    'module': 'economy-system'
};