/**
 * JSON snapshot helper for migrations.
 *
 * Before each migration's `up()` runs, the runner calls `backupTables(...)` with the
 * list of tables the migration declares. Each non-empty table is dumped as a JSON
 * array to `${client.dataDir}/migration-backups/<ISO>__<migration>__<table>.json`.
 *
 * Empty tables are skipped (no file written) to avoid noise on fresh installs.
 *
 * After a successful migration run the runner calls `pruneOldBackups` to retain only
 * the most recent `DEFAULT_KEEP_COUNT` files. ISO timestamps sort lexicographically,
 * so a plain alphabetical sort on filenames gives chronological order.
 */

const fs = require('fs');
const path = require('path');

const BACKUP_DIR_NAME = 'migration-backups';
const DEFAULT_KEEP_COUNT = 20;

function sanitizeForFilename(value) {
    return String(value).replace(/[^A-Za-z0-9_-]/gu, '-');
}

function backupDir(client) {
    return path.join(client.dataDir, BACKUP_DIR_NAME);
}

async function ensureBackupDir(client) {
    const dir = backupDir(client);
    await fs.promises.mkdir(dir, {recursive: true});
    return dir;
}

async function tableExists(sequelize, table) {
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    return tables.some(t => t === table || (typeof t === 'object' && t.tableName === table));
}

async function backupTable(client, sequelize, migrationName, table) {
    if (!(await tableExists(sequelize, table))) {
        client.logger.debug(`[migrations:backup] table ${table} does not exist yet — nothing to back up`);
        return null;
    }
    const [rows] = await sequelize.query(`SELECT *
                                          FROM "${table}"`);
    if (rows.length === 0) {
        client.logger.debug(`[migrations:backup] skipped empty table ${table}`);
        return null;
    }
    const dir = await ensureBackupDir(client);
    const iso = new Date().toISOString().replace(/[:.]/gu, '-');
    const filename = `${iso}__${sanitizeForFilename(migrationName)}__${sanitizeForFilename(table)}.json`;
    const filepath = path.join(dir, filename);
    await fs.promises.writeFile(filepath, JSON.stringify(rows, null, 2), 'utf8');
    client.logger.info(`[migrations:backup] wrote ${rows.length} row(s) from ${table} → ${filename}`);
    return filepath;
}

async function backupTables(client, sequelize, migrationName, tables) {
    if (!Array.isArray(tables) || tables.length === 0) return [];
    if (!client.dataDir) {
        client.logger.warn(`[migrations:backup] client.dataDir not set — skipping snapshot for ${migrationName}`);
        return [];
    }
    const written = [];
    for (const table of tables) {
        const filepath = await backupTable(client, sequelize, migrationName, table);
        if (filepath) written.push(filepath);
    }
    return written;
}

async function pruneOldBackups(client, keepCount = DEFAULT_KEEP_COUNT, protectedFiles = new Set()) {
    const dir = backupDir(client);
    if (!fs.existsSync(dir)) return [];
    const all = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.json'));
    if (all.length <= keepCount) return [];
    const sorted = all.sort();
    const candidates = sorted.slice(0, sorted.length - keepCount);
    const toDelete = candidates.filter(f => !protectedFiles.has(f));
    for (const file of toDelete) await fs.promises.unlink(path.join(dir, file));
    if (toDelete.length > 0) {
        client.logger.info(`[migrations:backup] pruned ${toDelete.length} old backup(s), kept ${keepCount} most recent + ${protectedFiles.size} from this boot`);
    }
    return toDelete;
}

module.exports = {
    backupTables,
    backupTable,
    pruneOldBackups,
    backupDir,
    DEFAULT_KEEP_COUNT
};