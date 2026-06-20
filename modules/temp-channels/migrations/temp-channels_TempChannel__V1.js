const OLD_TABLE = 'temp-channel_TempChannels';
const NEW_TABLE = 'temp-channel_TempChannelsv2';

/*
 * Replaces the old `migrate('temp-channels', 'TempChannelV1', 'TempChannel')` call
 * (which used the now-deprecated row-by-row JavaScript helper in src/functions/helpers.js)
 * with a SQL-level INSERT INTO ... SELECT inside a transaction.
 *
 * The legacy helper was not transactional and ran one create+destroy per row, so a
 * crash mid-loop could leave the source table partially drained while the destination
 * already had the copied rows. This version is atomic.
 *
 * Idempotent: if the old V1 table no longer exists (already migrated under the legacy
 * helper, or fresh install where the V1 schema was never present), the body is a no-op.
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
        const oldExists = tableSet.has(OLD_TABLE);
        const newExists = tableSet.has(NEW_TABLE);
        if (!oldExists || !newExists) return;

        await sequelize.transaction(async (transaction) => {
            await sequelize.query(
                `INSERT OR IGNORE INTO "${NEW_TABLE}" (id, "creatorID", "noMicChannel", "createdAt", "updatedAt")
                 SELECT id, "creatorID", "noMicChannel", "createdAt", "updatedAt" FROM "${OLD_TABLE}"`,
                {transaction}
            );
            await sequelize.query(`DELETE FROM "${OLD_TABLE}"`, {transaction});
        });
    },
    down: async () => {

        /*
         * No-op: copying rows back to a now-empty V1 schema is not a meaningful
         * rollback, and the old helper had no down path either.
         */
    }
};