const {DataTypes, Model} = require('sequelize');

module.exports = class EconomyCooldown extends Model {
    static init(sequelize) {
        return super.init({
            userId: DataTypes.STRING,
            command: DataTypes.STRING,
            timestamp: DataTypes.DATE
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