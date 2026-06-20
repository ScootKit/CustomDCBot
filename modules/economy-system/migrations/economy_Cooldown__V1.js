const {DataTypes} = require('sequelize');

const TABLE = 'economy_cooldowns';

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
            if (!description.userId) {
                await queryInterface.addColumn(TABLE, 'userId', {
                    type: DataTypes.STRING
                }, {transaction});
            }
            if (!description.timestamp) {
                await queryInterface.addColumn(TABLE, 'timestamp', {
                    type: DataTypes.DATE
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
            if (description.timestamp) await queryInterface.removeColumn(TABLE, 'timestamp', {transaction});
            if (description.userId) await queryInterface.removeColumn(TABLE, 'userId', {transaction});
        });
    }
};