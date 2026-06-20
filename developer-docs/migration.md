# Database Migrations

This guide explains how to write safe database migrations for CustomDCBot modules.

## Why migrations are needed

Sequelize's `db.sync()` (called in `main.js` at startup) creates tables that don't exist, but it **does not** add new
columns to existing tables. If you add a new field to a model, existing databases will be missing that column and
queries will fail. Migrations add the missing columns to existing installs.

## How migrations work

Migrations are plain files in a `migrations/` directory inside your module, next to `models/` and `events/`. On every
boot, after models are loaded and `db.sync()` has run, the migration runner
(`src/functions/migrations/runMigrations.js`) discovers each module's `migrations/` directory, works out which
migrations are still pending, and runs them in order using [Umzug](https://github.com/sequelize/umzug).

You do **not** wire anything up yourself - dropping a correctly named file into `migrations/` is enough. The runner
also:

- tracks applied migrations in the shared `system_DatabaseSchemeVersion` table, so each migration runs at most once;
- takes a JSON backup of every table a migration declares (see [Backups](#backups)) before running it;
- defers bot shutdown while a migration is in progress, so a SIGTERM/SIGINT can't interrupt a half-applied schema
  change. This is automatic - you do not call `migrationStart()` / `migrationEnd()` from migration code.

If any migration throws, the runner aborts the boot rather than letting the bot run on a partially migrated schema.

## File location and naming

```
modules/<module>/migrations/<tablePrefix>__V<n>.js
```

- `<tablePrefix>` is a label for the table(s) the migration touches, by convention `moduleName_Model` (e.g.
  `levels_User`, `economy_Shop`).
- `__V<n>` is the version. Migrations within a module run in filename order, so `__V1` runs before `__V2`.

Examples: `modules/levels/migrations/levels_User__V1.js`, `modules/economy-system/migrations/economy_Shop__V1.js`.

## Migration file shape

A migration exports an object with `up`, `down`, and an optional `tables` array. Both `up` and `down` receive Umzug's
context: `{sequelize, queryInterface, client}`.

```js
const {DataTypes} = require('sequelize');

const TABLE = 'levels_users';

module.exports = {
  // Tables to snapshot before this migration runs (see Backups). Optional but recommended.
  tables: [TABLE],

  up: async ({context: {queryInterface, sequelize}}) => {
    await sequelize.transaction(async (transaction) => {
      const description = await queryInterface.describeTable(TABLE).catch(() => ({}));

      if (!description.dailyMessages) {
        await queryInterface.addColumn(TABLE, 'dailyMessages', {
          type: DataTypes.INTEGER,
          defaultValue: 0,
          allowNull: false
        }, {transaction});
      }
    });
  },

  down: async ({context: {queryInterface, sequelize}}) => {
    await sequelize.transaction(async (transaction) => {
      const description = await queryInterface.describeTable(TABLE).catch(() => ({}));
      if (description.dailyMessages) await queryInterface.removeColumn(TABLE, 'dailyMessages', {transaction});
    });
  }
};
```

> **Note:** the table name passed to `queryInterface` is the real SQL table name (e.g. `levels_users`), not the
> Sequelize model name. Check your model's `tableName` option.

## Critical rule: migrations must be idempotent

The runner always asks Umzug to run whatever it considers pending. On a **brand-new install**, `db.sync()` has already
created the table with the current schema (including your new column) before any migration runs. Your migration will
still execute, so it must not fail or double-apply when the change is already present.

Guard every change with a `describeTable` check:

```js
const description = await queryInterface.describeTable(TABLE).catch(() => ({}));
if (!description.newColumn) {
  await queryInterface.addColumn(TABLE, 'newColumn', {/* ... */}, {transaction});
}
```

There is deliberately no "fresh install bypass". The runner cannot tell a brand-new table apart from an old table that
simply hasn't been migrated yet, so skipping on fresh installs would mark migrations applied without ever adding columns
to real upgrades. Idempotent bodies cost only a cheap `describeTable` call on fresh installs and do the right thing on
upgrades.

## Use incremental DDL, not table rebuilds

Add and drop columns with `queryInterface.addColumn` / `removeColumn` inside a `sequelize.transaction`. Do **not** read
all rows, `sync({force: true})`, and re-insert - that drops the table and risks data loss if interrupted, and is no
longer the supported pattern.

- **Add a column:** `describeTable` guard + `addColumn`.
- **Remove a column:** `describeTable` guard + `removeColumn`.
- **Rename a column:** guard on both names, then `renameColumn(TABLE, 'oldName', 'newName', {transaction})`.
- **Change a type / backfill values:** `addColumn` the new shape if missing, then run an `UPDATE` via
  `queryInterface.sequelize.query(..., {transaction})` to convert existing values.

Wrapping the work in a transaction means a failure rolls back cleanly and the migration stays pending for the next boot.

## Backups

List the tables your migration touches in the exported `tables` array. Before the migration's `up()` runs, the runner
writes a JSON snapshot of each non-empty listed table to `${dataDir}/migration-backups/<ISO>__<migration>__<table>.json`
and prunes all but the most recent snapshots. Empty tables are skipped. If a backup can't be written (e.g. no disk
space), the migration is aborted before any schema change is made.

## Multiple migrations

Add later schema changes as new files with the next version number; they stack on top of earlier ones.

```
modules/your-module/migrations/your-module_Thing__V1.js
modules/your-module/migrations/your-module_Thing__V2.js   # assumes V1 has already run
```

Because `__V1` runs before `__V2`, a `V2` migration can rely on `V1`'s columns already existing.

## Multiple models in one module

Give each model its own migration file with its own table prefix - they are tracked independently:

```
modules/economy-system/migrations/economy_User__V1.js
modules/economy-system/migrations/economy_Shop__V1.js
modules/economy-system/migrations/economy_Cooldown__V1.js
```

## Checklist

Before submitting a migration:

- [ ] File lives in `modules/<module>/migrations/` and is named `<tablePrefix>__V<n>.js`
- [ ] Exports `{up, down}` (and `tables` for the snapshot) in the Umzug v3 shape
- [ ] `up` is idempotent - every change guarded by a `describeTable` check
- [ ] Schema changes use `addColumn`/`removeColumn`/`renameColumn` inside a `sequelize.transaction`, not table rebuilds
- [ ] `down` reverses `up` (also guarded), so the migration is reversible
- [ ] `tables` lists every table the migration writes to, so a backup is taken first