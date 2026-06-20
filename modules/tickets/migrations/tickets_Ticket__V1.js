const OLD_TABLE = 'ticket_Ticketv1';
const NEW_TABLE = 'ticket_Ticketv2';

/*
 * Replaces `migrate('tickets', 'TicketV1', 'Ticket')` (the legacy row-by-row helper
 * in src/functions/helpers.js) with a SQL-level INSERT INTO ... SELECT inside a
 * transaction. The new Ticket schema adds a `type` column; existing V1 rows have no
 * value for it, so it defaults to NULL.
 *
 * Idempotent: if either table is missing (already migrated under the legacy helper,
 * or a fresh install where the V1 schema was never present), the body is a no-op.
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

        /*
         * No-op: copying rows back to a now-empty V1 schema is not a meaningful
         * rollback, and the old helper had no down path either.
         */
    }
};