/**
 * Discovers and runs Umzug-based migrations for each module.
 *
 * Each module that opts in has a `migrations/` directory next to `models/`/`events/`.
 * Migration files are named `<tablePrefix>_<Model>__V<n>.js` and export `{ up, down }`
 * functions in the Umzug v3 shape. The runner wires a per-module Umzug instance with
 * the shared `DatabaseSchemeVersionStorage` adapter so executed migrations are tracked
 * in the existing `system_DatabaseSchemeVersion` table.
 *
 * **Migration authoring rule:** every migration body MUST be idempotent. The runner
 * always invokes `umzug.up()` for whatever Umzug considers pending, which on a
 * brand-new install means running migrations against tables `db.sync()` already
 * materialized with the current schema. Use `queryInterface.describeTable` to guard
 * `addColumn` calls so they no-op when the column is already present.
 *
 * No "fresh install bypass" exists, because it cannot distinguish between
 *   (a) a brand-new install (table just created by db.sync with current schema), and
 *   (b) an existing install on pre-migration code (table exists with old schema, no
 *       marker row, columns missing).
 * Treating (b) as "fresh" would mark the migration applied without ever adding the
 * columns. Idempotent migration bodies are the correct alternative — they cost a
 * cheap describeTable call on fresh installs and do the right thing on upgrades.
 */

const fs = require('fs');
const path = require('path');
const {Umzug} = require('umzug');
const DatabaseSchemeVersionStorage = require('./DatabaseSchemeVersionStorage');
const {
    backupTables,
    pruneOldBackups,
    DEFAULT_KEEP_COUNT
} = require('./backup');

const MODULES_DIR = path.join(__dirname, '..', '..', '..', 'modules');

function listModuleMigrationDirs() {
    if (!fs.existsSync(MODULES_DIR)) return [];
    const out = [];
    for (const name of fs.readdirSync(MODULES_DIR)) {
        const migrationsDir = path.join(MODULES_DIR, name, 'migrations');
        if (fs.existsSync(migrationsDir) && fs.statSync(migrationsDir).isDirectory()) {
            out.push({
                moduleName: name,
                dir: migrationsDir
            });
        }
    }
    return out;
}

function migrationFileNames(dir) {
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.js'))
        .map(f => f.slice(0, -3));
}

function tablePrefixesFromNames(names) {
    const prefixes = new Set();
    for (const name of names) {
        const idx = name.lastIndexOf('__');
        if (idx !== -1) prefixes.add(name.slice(0, idx));
    }
    return Array.from(prefixes);
}

async function loadMigrationFile(filePath) {
    try {
        return require(filePath);
    } catch (err) {
        const wrapped = new Error(`Failed to load migration file ${filePath}: ${err.message}`);
        wrapped.cause = err;
        throw wrapped;
    }
}

function buildUmzug(client, dir, options = {}) {
    const sequelize = client.models['DatabaseSchemeVersion'].sequelize;
    const storage = new DatabaseSchemeVersionStorage({
        getModel: () => client.models['DatabaseSchemeVersion']
    });
    const {writtenThisBoot} = options;
    return new Umzug({
        migrations: {
            glob: path.join(dir, '*.js'),
            resolve: ({
                          name,
                          path: filePath,
                          context
                      }) => {
                const stripped = name.replace(/\.js$/u, '');
                return {
                    name: stripped,
                    up: async () => {
                        const mig = await loadMigrationFile(filePath);
                        if (Array.isArray(mig.tables) && mig.tables.length > 0) {
                            try {
                                const written = await backupTables(client, context.sequelize, stripped, mig.tables);
                                if (writtenThisBoot) for (const p of written) writtenThisBoot.add(path.basename(p));
                            } catch (backupErr) {
                                const e = new Error(
                                    `[migrations] Cannot take pre-migration backup for ${stripped}: ${backupErr.message}. ` +
                                    'Free disk space (or fix permissions on the migration-backups directory) and retry.'
                                );
                                e.cause = backupErr;
                                throw e;
                            }
                        }
                        return mig.up({
                            name: stripped,
                            context
                        });
                    },
                    down: async () => {
                        const mig = await loadMigrationFile(filePath);
                        return mig.down({
                            name: stripped,
                            context
                        });
                    }
                };
            }
        },
        context: {
            sequelize,
            queryInterface: sequelize.getQueryInterface(),
            client
        },
        storage,
        logger: {
            info: (m) => client.logger.info(typeof m === 'string' ? m : JSON.stringify(m)),
            warn: (m) => client.logger.warn(typeof m === 'string' ? m : JSON.stringify(m)),
            error: (m) => client.logger.error(typeof m === 'string' ? m : JSON.stringify(m)),
            debug: (m) => client.logger.debug(typeof m === 'string' ? m : JSON.stringify(m))
        }
    });
}

async function runAllMigrations(client, hooks = {}) {
    if (!client || !client.models || !client.models['DatabaseSchemeVersion']) {
        throw new Error(
            'runAllMigrations: client.models.DatabaseSchemeVersion is not available. ' +
            'Ensure `client.models` is assigned after loadModels but before this call.'
        );
    }
    const {
        onMigrationStart,
        onMigrationEnd
    } = hooks;
    const moduleDirs = listModuleMigrationDirs();
    const writtenThisBoot = new Set();
    let anyMigrationRan = false;

    for (const {
        moduleName,
        dir
    } of moduleDirs) {
        const fileNames = migrationFileNames(dir);
        if (fileNames.length === 0) continue;

        const umzug = buildUmzug(client, dir, {writtenThisBoot});
        const pending = await umzug.pending();
        if (pending.length === 0) {
            client.logger.debug(`[migrations:${moduleName}] up to date`);
            continue;
        }
        client.logger.info(`[migrations:${moduleName}] running ${pending.length} pending migration(s): ${pending.map(p => p.name).join(', ')}`);
        if (onMigrationStart) onMigrationStart();
        try {
            await umzug.up();
        } finally {
            if (onMigrationEnd) onMigrationEnd();
        }
        anyMigrationRan = true;
    }

    if (anyMigrationRan && client.dataDir) {
        try {
            await pruneOldBackups(client, DEFAULT_KEEP_COUNT, writtenThisBoot);
        } catch (err) {
            client.logger.warn(`[migrations:backup] prune failed: ${err.message}`);
        }
    }
}

module.exports = {
    runAllMigrations,
    listModuleMigrationDirs,
    migrationFileNames,
    tablePrefixesFromNames,
    buildUmzug,
    loadMigrationFile
};