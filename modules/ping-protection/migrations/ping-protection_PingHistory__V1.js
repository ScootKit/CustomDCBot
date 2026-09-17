const {DataTypes} = require('sequelize');

const TABLE = 'ping_protection_history';

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
            
            if (!description.pingType) {
                await queryInterface.addColumn(TABLE, 'pingType', {
                    type: DataTypes.STRING,
                    allowNull: true,
                    defaultValue: null
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
            if (description.pingType) {
                await queryInterface.removeColumn(TABLE, 'pingType', {transaction});
            }
        });
    }
};