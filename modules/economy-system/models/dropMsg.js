const {DataTypes, Model} = require('sequelize');

module.exports = class DropMsg extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            }
        }, {
            tableName: 'economy_dropMsg',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'dropMsg',
    'module': 'economy-system'
};