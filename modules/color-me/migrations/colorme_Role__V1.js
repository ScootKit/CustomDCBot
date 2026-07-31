const {DataTypes} = require('sequelize');

const TABLE = 'colorme_Role';

module.exports = {
    // Tables to snapshot before this migration runs (see Backups). Optional but recommended.
    tables: [TABLE],

    up: async ({context: {queryInterface, sequelize}}) => {
        await sequelize.transaction(async (transaction) => {
            const description = await queryInterface.describeTable(TABLE).catch(() => ({}));

            if (!description.primaryColor && description.color) {
                await queryInterface.renameColumn(TABLE, 'color', 'primaryColor', {transaction});
            }
            if (!description.secondaryColor) {
                await queryInterface.addColumn(TABLE, 'secondaryColor', {
                    type: DataTypes.STRING
                }, {transaction});
            }
            if (!description.holo) {
                await queryInterface.addColumn(TABLE, 'holo', {
                    defaultValue: false,
                    type: DataTypes.BOOLEAN
                }, {transaction});
            }
        });
    },

    down: async ({context: {queryInterface, sequelize}}) => {
        await sequelize.transaction(async (transaction) => {
            const description = await queryInterface.describeTable(TABLE).catch(() => ({}));
            if (description.primaryColor && !description.color) await queryInterface.renameColumn(TABLE, 'primaryColor', 'color', {transaction});
            if (description.secondaryColor) await queryInterface.removeColumn(TABLE, 'secondaryColor', {transaction});
            if (description.holo) await queryInterface.removeColumn(TABLE, 'holo', {transaction});
        });
    }
};