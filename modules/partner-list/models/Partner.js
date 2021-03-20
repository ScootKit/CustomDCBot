const {DataTypes, Model} = require('sequelize');

module.exports = class Partner extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            invLink: DataTypes.STRING,
            teamUserID: DataTypes.STRING,
            userID: DataTypes.STRING,
            name: DataTypes.STRING,
            category: DataTypes.STRING
        }, {
            tableName: 'partnerlist_Partner',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'Partner',
    'module': 'partner-list'
};