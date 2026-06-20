const TABLE = 'economy_shop';

/*
 * V1 commit (98e3b4f4, Oct 2024) changed the primary key from `name` to a new `id`
 * column. The pre-V1 schema had no `id` column at all: `name` was the STRING PK.
 * The current model is `id STRING PRIMARY KEY, name STRING, price INTEGER, role TEXT`.
 *
 * The old inline V1 did `findAll → sync({force:true}) → re-insert with i++` to perform
 * this PK swap. Customers who ran that inline V1 have the new schema and their existing
 * rows received sequential integer-as-string ids. Customers who never ran it (e.g. they
 * upgraded straight from pre-V1 code to this new Umzug-based code) still have the old
 * `name`-as-PK table; their shop queries by `id` would silently fail.
 *
 * SQLite has no `ALTER TABLE ... DROP PRIMARY KEY`, so this migration uses the canonical
 * SQLite table-rebuild pattern: create a new table with the right schema, copy the rows
 * across, drop the old, rename the new. For data that came from the pre-V1 `name`-as-PK
 * schema, we use `name` itself as the new `id` value — that's the stablest mapping
 * (it's already unique, and operator-facing identifiers tend to reference items by
 * name in the bot's config).
 *
 * Idempotent: if `id` already exists in the table description (post-V1, fresh install,
 * or already-migrated), the body is a no-op.
 */
module.exports = {
    tables: [TABLE],
    up: async ({
                   context: {
                       queryInterface,
                       sequelize
                   }
               }) => {
        const description = await queryInterface.describeTable(TABLE).catch(() => ({}));
        if (description.id) return;

        await sequelize.transaction(async (transaction) => {
            await sequelize.query(`CREATE TABLE "${TABLE}_new" (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                price INTEGER,
                role TEXT,
                "createdAt" DATETIME,
                "updatedAt" DATETIME
            )`, {transaction});

            await sequelize.query(`INSERT INTO "${TABLE}_new" (id, name, price, role, "createdAt", "updatedAt")
                SELECT name, name, price, role, "createdAt", "updatedAt" FROM "${TABLE}"`, {transaction});

            await sequelize.query(`DROP TABLE "${TABLE}"`, {transaction});
            await sequelize.query(`ALTER TABLE "${TABLE}_new" RENAME TO "${TABLE}"`, {transaction});
        });
    },
    down: async () => {

        /*
         * No-op: reverting from `id`-PK back to `name`-PK is not a meaningful rollback
         * once the runtime code expects `id`. Operators should restore from a backup
         * (`migration-backups/<ISO>__economy_Shop__V1__economy_shop.json`) instead.
         */
    }
};