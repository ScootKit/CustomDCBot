const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    Sequelize,
    DataTypes
} = require('sequelize');
const {
    backupTables,
    backupTable,
    pruneOldBackups,
    backupDir
} = require('../../src/functions/migrations/backup');

function noop() {
}

function makeClient(dataDir) {
    return {
        dataDir,
        logger: {
            info: noop,
            warn: noop,
            error: noop,
            debug: noop
        }
    };
}

async function makeSequelizeWithUsers() {
    const sequelize = new Sequelize({dialect: 'sqlite', storage: ':memory:', logging: false});
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('users', {
        id: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        name: DataTypes.STRING,
        score: DataTypes.INTEGER
    });
    return sequelize;
}

describe('backupTable / backupTables', () => {
    let tmpDataDir;
    let client;

    beforeEach(() => {
        tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-backup-'));
        client = makeClient(tmpDataDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDataDir, {
            recursive: true,
            force: true
        });
    });

    test('writes a JSON snapshot of a populated table and returns its path', async () => {
        const sequelize = await makeSequelizeWithUsers();
        await sequelize.query('INSERT INTO users (id, name, score) VALUES (?, ?, ?), (?, ?, ?)',
            {replacements: ['1', 'Alice', 42, '2', 'Bob', 17]});

        const filepath = await backupTable(client, sequelize, 'users_User__V1', 'users');

        expect(filepath).not.toBeNull();
        expect(fs.existsSync(filepath)).toBe(true);
        const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        expect(content).toEqual([
            {
                id: '1',
                name: 'Alice',
                score: 42
            },
            {
                id: '2',
                name: 'Bob',
                score: 17
            }
        ]);
        expect(path.basename(filepath)).toMatch(/__users_User__V1__users\.json$/u);

        await sequelize.close();
    });

    test('skips empty tables (no file written)', async () => {
        const sequelize = await makeSequelizeWithUsers();
        const filepath = await backupTable(client, sequelize, 'users_User__V1', 'users');
        expect(filepath).toBeNull();
        const dir = backupDir(client);
        if (fs.existsSync(dir)) expect(fs.readdirSync(dir)).toEqual([]);
        await sequelize.close();
    });

    test('skips tables that do not exist (no throw)', async () => {
        const sequelize = await makeSequelizeWithUsers();
        const filepath = await backupTable(client, sequelize, 'users_User__V1', 'does_not_exist');
        expect(filepath).toBeNull();
        await sequelize.close();
    });

    test('backupTables iterates the list and returns paths for the non-empty ones', async () => {
        const sequelize = await makeSequelizeWithUsers();
        await sequelize.query('INSERT INTO users (id, name, score) VALUES (?, ?, ?)', {replacements: ['1', 'A', 1]});
        const queryInterface = sequelize.getQueryInterface();
        await queryInterface.createTable('empty_table', {
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            }
        });

        const paths = await backupTables(client, sequelize, 'mig__V1', ['users', 'empty_table', 'missing_table']);

        expect(paths).toHaveLength(1);
        expect(paths[0]).toMatch(/__users\.json$/u);
        await sequelize.close();
    });

    test('backupTables with empty or non-array tables list is a no-op', async () => {
        const sequelize = await makeSequelizeWithUsers();
        expect(await backupTables(client, sequelize, 'mig__V1', [])).toEqual([]);
        expect(await backupTables(client, sequelize, 'mig__V1', null)).toEqual([]);
        let absent;
        expect(await backupTables(client, sequelize, 'mig__V1', absent)).toEqual([]);
        await sequelize.close();
    });

    test('creates the backup directory if it does not exist', async () => {
        const sequelize = await makeSequelizeWithUsers();
        await sequelize.query('INSERT INTO users (id, name, score) VALUES (?, ?, ?)', {replacements: ['1', 'A', 1]});

        expect(fs.existsSync(backupDir(client))).toBe(false);
        await backupTable(client, sequelize, 'mig__V1', 'users');
        expect(fs.existsSync(backupDir(client))).toBe(true);

        await sequelize.close();
    });
});

describe('pruneOldBackups', () => {
    let tmpDataDir;
    let client;

    beforeEach(() => {
        tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-prune-'));
        client = makeClient(tmpDataDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDataDir, {
            recursive: true,
            force: true
        });
    });

    test('does nothing when the backup directory does not exist', async () => {
        const deleted = await pruneOldBackups(client, 5);
        expect(deleted).toEqual([]);
    });

    test('keeps everything when count is at or below the limit', async () => {
        const dir = backupDir(client);
        fs.mkdirSync(dir, {recursive: true});
        for (let i = 1; i <= 3; i++) fs.writeFileSync(path.join(dir, `2026-01-0${i}__mig__t.json`), '[]');

        const deleted = await pruneOldBackups(client, 5);
        expect(deleted).toEqual([]);
        expect(fs.readdirSync(dir)).toHaveLength(3);
    });

    test('deletes the oldest files when count exceeds the limit', async () => {
        const dir = backupDir(client);
        fs.mkdirSync(dir, {recursive: true});
        const names = [
            '2026-01-01__mig__t.json',
            '2026-01-02__mig__t.json',
            '2026-01-03__mig__t.json',
            '2026-01-04__mig__t.json',
            '2026-01-05__mig__t.json'
        ];
        for (const n of names) fs.writeFileSync(path.join(dir, n), '[]');

        const deleted = await pruneOldBackups(client, 2);

        expect(deleted.sort()).toEqual([
            '2026-01-01__mig__t.json',
            '2026-01-02__mig__t.json',
            '2026-01-03__mig__t.json'
        ]);
        expect(fs.readdirSync(dir).sort()).toEqual([
            '2026-01-04__mig__t.json',
            '2026-01-05__mig__t.json'
        ]);
    });

    test('ignores non-JSON files when counting/pruning', async () => {
        const dir = backupDir(client);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(dir, '2026-01-01__mig__t.json'), '[]');
        fs.writeFileSync(path.join(dir, 'README.txt'), 'do not touch');

        const deleted = await pruneOldBackups(client, 0);
        expect(deleted).toEqual(['2026-01-01__mig__t.json']);
        expect(fs.readdirSync(dir).sort()).toEqual(['README.txt']);
    });

    test('does not delete files in the protected set even when they would otherwise be pruned', async () => {
        const dir = backupDir(client);
        fs.mkdirSync(dir, {recursive: true});
        const names = [
            '2026-01-01__mig__t.json',
            '2026-01-02__mig__t.json',
            '2026-01-03__mig__t.json',
            '2026-01-04__mig__t.json',
            '2026-01-05__mig__t.json'
        ];
        for (const n of names) fs.writeFileSync(path.join(dir, n), '[]');

        const protect = new Set(['2026-01-01__mig__t.json', '2026-01-02__mig__t.json']);
        const deleted = await pruneOldBackups(client, 2, protect);

        expect(deleted).toEqual(['2026-01-03__mig__t.json']);
        expect(fs.readdirSync(dir).sort()).toEqual([
            '2026-01-01__mig__t.json',
            '2026-01-02__mig__t.json',
            '2026-01-04__mig__t.json',
            '2026-01-05__mig__t.json'
        ]);
    });
});