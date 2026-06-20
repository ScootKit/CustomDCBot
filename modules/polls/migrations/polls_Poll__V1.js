const {DataTypes} = require('sequelize');

const TABLE = 'polls_Poll';

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
            if (!description.maxSelections) {
                await queryInterface.addColumn(TABLE, 'maxSelections', {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 1
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
            if (description.maxSelections) await queryInterface.removeColumn(TABLE, 'maxSelections', {transaction});
        });
    }
};