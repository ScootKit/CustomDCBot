const {DataTypes} = require('sequelize');

/*
 * Model's configured tableName is `temp-channel_TempChannelsv2` (singular `channel`,
 * trailing `v2`). Legacy markers use the singular form too.
 */
const TABLE = 'temp-channel_TempChannelsv2';

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
            if (!description.archivedAt) {
                await queryInterface.addColumn(TABLE, 'archivedAt', {
                    type: DataTypes.DATE,
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
            if (description.archivedAt) await queryInterface.removeColumn(TABLE, 'archivedAt', {transaction});
        });
    }
};