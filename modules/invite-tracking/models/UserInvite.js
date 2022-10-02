const {DataTypes, Model} = require('sequelize');

module.exports = class UserInvite extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            left: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            inviteCode: DataTypes.STRING,
            inviteType: DataTypes.STRING,
            inviter: DataTypes.STRING,
            userID: DataTypes.STRING
        }, {
            tableName: 'invite-tracking_UserInvite',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'UserInvite',
    'module': 'invite-tracking'
};