const { DataTypes, Model } = require('sequelize');

module.exports = class LinkedAccount extends Model {
    static init(sequelize) {
        return super.init({
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            mainID: DataTypes.STRING,
            linkedBy: DataTypes.STRING,
            linkedAt: DataTypes.DATE
        }, {
            tableName: 'moderation_LinkedAccounts',
            timestamps: false,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'LinkedAccount',
    module: 'moderation'
};
