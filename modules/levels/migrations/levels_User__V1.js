const {DataTypes} = require('sequelize');

const TABLE = 'levels_users';

module.exports = {
    tables: [TABLE],
    up: async ({
                   context: {
                       queryInterface,
                       sequelize
                   }
               }) => {
        await sequelize.transaction(async (transaction) => {
            const description = await queryInterface.describeTable(TABLE).catch(() => ({}));

            if (!description.dailyMessages) {
                await queryInterface.addColumn(TABLE, 'dailyMessages', {
                    type: DataTypes.INTEGER,
                    defaultValue: 0,
                    allowNull: false
                }, {transaction});
            }
            if (!description.dailyVoiceSeconds) {
                await queryInterface.addColumn(TABLE, 'dailyVoiceSeconds', {
                    type: DataTypes.INTEGER,
                    defaultValue: 0,
                    allowNull: false
                }, {transaction});
            }
            if (!description.dailyResetDate) {
                await queryInterface.addColumn(TABLE, 'dailyResetDate', {
                    type: DataTypes.STRING,
                    allowNull: true
                }, {transaction});
            }
        });
    },
    down: async ({
                     context: {
                         queryInterface,
                         sequelize
                     }
                 }) => {
        await sequelize.transaction(async (transaction) => {
            const description = await queryInterface.describeTable(TABLE).catch(() => ({}));
            if (description.dailyResetDate) await queryInterface.removeColumn(TABLE, 'dailyResetDate', {transaction});
            if (description.dailyVoiceSeconds) await queryInterface.removeColumn(TABLE, 'dailyVoiceSeconds', {transaction});
            if (description.dailyMessages) await queryInterface.removeColumn(TABLE, 'dailyMessages', {transaction});
        });
    }
};