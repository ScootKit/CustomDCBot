const OLD_TABLE = 'ticket_Ticketv1';
const NEW_TABLE = 'ticket_Ticketv2';

/*
 * Copies V1 rows into the V2 table in one transaction; the new `type` column defaults to NULL.
 * No-ops when either table is absent.
 */
module.exports = {
    tables: [OLD_TABLE, NEW_TABLE],
    up: async ({
                   context: {
                       queryInterface,
                       sequelize
                   }
               }) => {
        const allTables = await queryInterface.showAllTables();
        const tableSet = new Set(allTables.map(t => (typeof t === 'object' ? t.tableName : t)));
        if (!tableSet.has(OLD_TABLE) || !tableSet.has(NEW_TABLE)) return;

        await sequelize.transaction(async (transaction) => {
            await sequelize.query(
                `INSERT
                OR IGNORE INTO "${NEW_TABLE}" (id, open, "userID", "channelID", "msgLogURL", "msgCount", "addedUsers", "createdAt", "updatedAt")
                SELECT id, open, "userID", "channelID", "msgLogURL", "msgCount", "addedUsers", "createdAt", "updatedAt"
                FROM "${OLD_TABLE}"`,
                {transaction}
            );
            await sequelize.query(`DELETE
                                   FROM "${OLD_TABLE}"`, {transaction});
        });
    },
    down: async () => {

        // No-op: copying rows back to a now-empty V1 schema is not a meaningful rollback.
    }
};