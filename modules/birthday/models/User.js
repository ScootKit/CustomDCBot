const {DataTypes, Model} = require('sequelize');

module.exports = class BirthdayUser extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            month: DataTypes.INTEGER,
            day: DataTypes.INTEGER,
            year: DataTypes.INTEGER,
            verified: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            sync: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            }
        }, {
            tableName: 'birthday_users',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'User',
    'module': 'birthday'
};