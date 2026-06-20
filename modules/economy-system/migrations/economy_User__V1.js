const {DataTypes} = require('sequelize');

const TABLE = 'economy_user';

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
            if (!description.bank) {
                await queryInterface.addColumn(TABLE, 'bank', {
                    type: DataTypes.INTEGER
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
            if (description.bank) await queryInterface.removeColumn(TABLE, 'bank', {transaction});
        });
    }
};