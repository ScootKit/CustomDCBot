const {DataTypes} = require('sequelize');

const TABLE = 'staff_management_activity_checks';

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
            if (!description.initiatorId) {
                await queryInterface.addColumn(TABLE, 'initiatorId', {
                    type: DataTypes.STRING,
                    allowNull: true
                }, {transaction});
            }
            if (!description.isAutomated) {
                await queryInterface.addColumn(TABLE, 'isAutomated', {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
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
            if (description.isAutomated) await queryInterface.removeColumn(TABLE, 'isAutomated', {transaction});
            if (description.initiatorId) await queryInterface.removeColumn(TABLE, 'initiatorId', {transaction});
        });
    }
};