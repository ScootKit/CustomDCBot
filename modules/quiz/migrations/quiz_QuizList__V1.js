const {DataTypes} = require('sequelize');

/*
 * The model is registered as `QuizList` (legacy marker key `quiz_QuizList`) but its
 * `tableName` is `quiz_Quiz`. Reference the table by its real name in the DDL.
 */
const TABLE = 'quiz_Quiz';

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
            if (!description.imageURL) {
                await queryInterface.addColumn(TABLE, 'imageURL', {
                    type: DataTypes.STRING,
                    allowNull: true
                }, {transaction});
            }
            if (!description.headline) {
                await queryInterface.addColumn(TABLE, 'headline', {
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
            if (description.headline) await queryInterface.removeColumn(TABLE, 'headline', {transaction});
            if (description.imageURL) await queryInterface.removeColumn(TABLE, 'imageURL', {transaction});
        });
    }
};