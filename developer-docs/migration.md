# Database Migrations

This guide explains how to write safe database migrations for CustomDCBot modules.

## Why migrations are needed

Sequelize's `db.sync()` (called in `main.js` at startup) creates tables that don't exist, but it **does not** add new
columns to existing tables. If you add a new field to a model, existing databases will be missing that column and
queries will fail.

Migrations solve this by reading existing data, recreating the table with the new schema, and re-inserting the data.

## Where migrations run

Migrations go in your module's `events/botReady.js`, at the top of the `run` function - before any other logic.

## The DatabaseSchemeVersion table

Every migration is tracked using the shared `DatabaseSchemeVersion` model. Before running a migration, check if it has
already been applied:

```js
const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({
    where: {
        model: 'your-module_YourModel',
        version: 'V1'
    }
});
if (!dbVersion) {
    // Run migration
}
```

After the migration completes, mark it as done:

```js
await client.models['DatabaseSchemeVersion'].create({
    model: 'your-module_YourModel',
    version: 'V1'
});
```

The naming convention for `model` is `moduleName_ModelName` (e.g. `birthday_User`, `activity-streak_StreakUser`).

## Migration pattern

```js
const {
    migrationStart,
    migrationEnd
} = require('../../../main');

module.exports.run = async function (client) {
    const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({
        where: {model: 'your-module_YourModel'}
    });
    if (!dbVersion) {
        migrationStart();
        try {
            client.logger.info('[your-module] Running V1 migration (adding newField)...');

            // 1. Read existing data with EXPLICIT attributes (only columns that exist pre-migration)
            const data = await client.models['your-module']['YourModel'].findAll({
                attributes: ['id', 'existingField1', 'existingField2']
            });

            // 2. Drop and recreate the table with the new schema
            await client.models['your-module']['YourModel'].sync({force: true});

            // 3. Re-insert all data with the new field's default value
            for (const row of data) {
                await client.models['your-module']['YourModel'].create({
                    id: row.id,
                    existingField1: row.existingField1,
                    existingField2: row.existingField2,
                    newField: false // default value for the new column
                });
            }

            client.logger.info('[your-module] V1 migration complete.');
            await client.models['DatabaseSchemeVersion'].create({
                model: 'your-module_YourModel',
                version: 'V1'
            });
        } finally {
            migrationEnd();
        }
    }

    // ... rest of your botReady logic
};
```

## Critical rules

### Always use explicit attributes in findAll

```js
// WRONG - will try to SELECT the new column that doesn't exist yet
const data = await client.models['your-module']['YourModel'].findAll();

// CORRECT - only selects columns that exist in the pre-migration table
const data = await client.models['your-module']['YourModel'].findAll({
    attributes: ['id', 'existingField1', 'existingField2']
});
```

Your model already defines the new field, so Sequelize will include it in the `SELECT` statement by default. Since the
column doesn't exist in the database yet, the query will crash. Always list only the columns that exist **before** your
migration.

### Always wrap migrations in migrationStart/migrationEnd

```js
const {
    migrationStart,
    migrationEnd
} = require('../../../main');
```

Call `migrationStart()` before the migration begins and `migrationEnd()` when it finishes. **Always** use `try/finally`
to ensure `migrationEnd()` runs even if the migration throws an error. This prevents the bot from shutting down
mid-migration (which would cause data loss since `sync({force: true})` drops the table before recreating it).

### Always re-insert with explicit field mapping

```js
// WRONG - may carry over unexpected fields or miss the new default
await client.models['your-module']['YourModel'].create(row);

// CORRECT - explicit mapping with new field default
await client.models['your-module']['YourModel'].create({
    id: row.id,
    existingField1: row.existingField1,
    newField: false
});
```

### Mark the migration version after all data is re-inserted

The `DatabaseSchemeVersion` entry should be created **after** all data has been successfully migrated. If the migration
fails halfway, it will re-run on next startup (which is safe since it checks the version first).

## Multiple migrations

Migrations stack sequentially. Each one runs in order and assumes all previous migrations have already been applied.
This matters for which columns you list in `attributes`.

### Adding a second migration later

When a new release needs another schema change, add a new migration block **after** the existing one:

```js
// V1 migration (existing - added "hidden" field)
const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({
    where: {model: 'your-module_YourModel'}
});
if (!dbVersion) {
    migrationStart();
    try {
        const data = await client.models['your-module']['YourModel'].findAll({
            attributes: ['id', 'existingField1', 'existingField2']
        });
        await client.models['your-module']['YourModel'].sync({force: true});
        for (const row of data) {
            await client.models['your-module']['YourModel'].create({
                id: row.id,
                existingField1: row.existingField1,
                existingField2: row.existingField2,
                hidden: false
            });
        }
        await client.models['DatabaseSchemeVersion'].create({
            model: 'your-module_YourModel',
            version: 'V1'
        });
    } finally {
        migrationEnd();
    }
}

// V2 migration (new - added "priority" field)
const dbVersionV2 = await client.models['DatabaseSchemeVersion'].findOne({
    where: {
        model: 'your-module_YourModel',
        version: 'V2'
    }
});
if (!dbVersionV2) {
    migrationStart();
    try {
        // V1 has already run, so "hidden" exists in the table now
        const data = await client.models['your-module']['YourModel'].findAll({
            attributes: ['id', 'existingField1', 'existingField2', 'hidden']
        });
        await client.models['your-module']['YourModel'].sync({force: true});
        for (const row of data) {
            await client.models['your-module']['YourModel'].create({
                id: row.id,
                existingField1: row.existingField1,
                existingField2: row.existingField2,
                hidden: row.hidden,
                priority: 0
            });
        }
        await client.models['DatabaseSchemeVersion'].upsert({
            model: 'your-module_YourModel',
            version: 'V2'
        });
    } finally {
        migrationEnd();
    }
}
```

V2's `attributes` includes `hidden` because V1 has already added it by the time V2 runs.

### Adding multiple fields in a single release

If you're adding multiple new fields at the same time (e.g. both `hidden` and `priority` in the same release), you only
need **one** migration. Don't create separate migrations for each field - just handle them all in one version bump:

```js
const dbVersion = await client.models['DatabaseSchemeVersion'].findOne({
    where: {model: 'your-module_YourModel'}
});
if (!dbVersion) {
    migrationStart();
    try {
        const data = await client.models['your-module']['YourModel'].findAll({
            attributes: ['id', 'existingField1', 'existingField2']
        });
        await client.models['your-module']['YourModel'].sync({force: true});
        for (const row of data) {
            await client.models['your-module']['YourModel'].create({
                id: row.id,
                existingField1: row.existingField1,
                existingField2: row.existingField2,
                hidden: false,   // new field 1
                priority: 0      // new field 2
            });
        }
        await client.models['DatabaseSchemeVersion'].create({
            model: 'your-module_YourModel',
            version: 'V1'
        });
    } finally {
        migrationEnd();
    }
}
```

### Fresh installs vs. existing databases

On a fresh install (no existing database), `db.sync()` in `main.js` creates all tables with all columns from the model
definition. The migration check finds no existing rows and no `DatabaseSchemeVersion` entry. The migration runs but
`findAll` returns an empty array, so it effectively just creates the version entry. This is fine - the migration is a
no-op on empty tables.

### Removing or renaming fields

If you need to **remove** a column, the same pattern works - just don't include the removed field in the re-insert step.
The `sync({force: true})` recreates the table from the model definition (which no longer has the field), so the column
disappears.

If you need to **rename** a column, read the old column name in `attributes` and write to the new column name during
re-insert:

```js
const data = await client.models['your-module']['YourModel'].findAll({
    attributes: ['id', 'oldFieldName']
});
await client.models['your-module']['YourModel'].sync({force: true});
for (const row of data) {
    await client.models['your-module']['YourModel'].create({
        id: row.id,
        newFieldName: row.oldFieldName  // renamed
    });
}
```

### Changing a field's type

Same approach - read the old data, recreate the table, convert during re-insert:

```js
const data = await client.models['your-module']['YourModel'].findAll({
    attributes: ['id', 'count']  // was STRING, now INTEGER
});
await client.models['your-module']['YourModel'].sync({force: true});
for (const row of data) {
    await client.models['your-module']['YourModel'].create({
        id: row.id,
        count: parseInt(row.count, 10) || 0
    });
}
```

### Multiple models in one module

If your module has multiple models that both need migrations, run them independently with separate version keys:

```js
// Model A migration
const dbVersionA = await client.models['DatabaseSchemeVersion'].findOne({
    where: {model: 'your-module_ModelA'}
});
if (!dbVersionA) {
    migrationStart();
    try {
        // ... migrate ModelA ...
        await client.models['DatabaseSchemeVersion'].create({
            model: 'your-module_ModelA',
            version: 'V1'
        });
    } finally {
        migrationEnd();
    }
}

// Model B migration
const dbVersionB = await client.models['DatabaseSchemeVersion'].findOne({
    where: {model: 'your-module_ModelB'}
});
if (!dbVersionB) {
    migrationStart();
    try {
        // ... migrate ModelB ...
        await client.models['DatabaseSchemeVersion'].create({
            model: 'your-module_ModelB',
            version: 'V1'
        });
    } finally {
        migrationEnd();
    }
}
```

Each model tracks its own version independently. They don't need to share version numbers.

## Checklist

Before submitting a migration:

- [ ] `findAll` uses explicit `attributes` listing only pre-migration columns
- [ ] Migration is wrapped in `migrationStart()` / `migrationEnd()` with `try/finally`
- [ ] New fields are explicitly set with their default value during re-insert
- [ ] `DatabaseSchemeVersion` entry is created **after** all data is re-inserted
- [ ] Version string follows the pattern `V1`, `V2`, etc.
- [ ] Model name follows the pattern `moduleName_ModelName`
- [ ] Migration runs at the top of `botReady.js` before any other module logic