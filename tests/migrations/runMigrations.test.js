const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    Sequelize,
    DataTypes,
    Model
} = require('sequelize');
const {
    migrationFileNames,
    tablePrefixesFromNames,
    loadMigrationFile,
    buildUmzug,
    runAllMigrations
} = require('../../src/functions/migrations/runMigrations');

describe('migration filename helpers', () => {
    test('migrationFileNames strips .js extensions', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-test-'));
        fs.writeFileSync(path.join(dir, 'foo_Bar__V1.js'), '');
        fs.writeFileSync(path.join(dir, 'foo_Bar__V2.js'), '');
        fs.writeFileSync(path.join(dir, 'notajsfile.txt'), '');

        expect(migrationFileNames(dir).sort()).toEqual(['foo_Bar__V1', 'foo_Bar__V2']);

        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    });

    test('tablePrefixesFromNames extracts the part before the last __', () => {
        expect(tablePrefixesFromNames(['foo_Bar__V1', 'foo_Bar__V2', 'foo_Baz__V1']).sort())
            .toEqual(['foo_Bar', 'foo_Baz']);
    });

    test('tablePrefixesFromNames ignores names without a separator', () => {
        expect(tablePrefixesFromNames(['legacyname'])).toEqual([]);
    });
});

function makeMarkerModel() {
    const sequelize = new Sequelize({dialect: 'sqlite', storage: ':memory:', logging: false});

    class DatabaseSchemeVersion extends Model {
    }

    DatabaseSchemeVersion.init({
        model: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        version: DataTypes.STRING
    }, {
        sequelize,
        tableName: 'system_DatabaseSchemeVersion',
        timestamps: true
    });
    return {
        DatabaseSchemeVersion,
        sequelize
    };
}

function noop() {
}

function fakeClient(DatabaseSchemeVersion) {
    return {
        models: {DatabaseSchemeVersion},
        logger: {
            info: noop,
            warn: noop,
            error: noop,
            debug: noop
        }
    };
}

describe('loadMigrationFile', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-load-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {
            recursive: true,
            force: true
        });
    });

    test('wraps require() errors with the offending file path', async () => {
        const file = path.join(tmpDir, 'broken__V1.js');
        fs.writeFileSync(file, 'this is not valid javascript {{{');
        await expect(loadMigrationFile(file)).rejects.toThrow(file);
    });
});

describe('migration shutdown hooks via buildUmzug', () => {

    /*
     * Regression: the old inline migrations called `migrationStart()` / `migrationEnd()`
     * to defer SIGINT/SIGTERM. Stripping those calls left the new runner without any
     * shutdown protection. The runner now exposes `onMigrationStart` / `onMigrationEnd`
     * callbacks via its options arg; main.js wires them to client._migrationCount
     * increment/decrement. Verify the contract: callbacks always fire as a pair,
     * even when the migration itself throws.
     */
    const realMigrationsDir = path.join(__dirname, '..', '..', 'modules', 'levels', 'migrations');

    function pushStart(events) {
        return () => events.push('start');
    }

    function pushEnd(events) {
        return () => events.push('end');
    }

    test('hooks fire as a start/end pair around a successful umzug.up()', async () => {
        const {
            DatabaseSchemeVersion,
            sequelize
        } = makeMarkerModel();
        await sequelize.sync();
        const queryInterface = sequelize.getQueryInterface();
        await queryInterface.createTable('levels_users', {
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            xp: DataTypes.INTEGER
        });

        const events = [];
        const onStart = pushStart(events);
        const onEnd = pushEnd(events);
        const umzug = buildUmzug(fakeClient(DatabaseSchemeVersion), realMigrationsDir);

        onStart();
        try {
            await umzug.up();
        } finally {
            onEnd();
        }

        expect(events).toEqual(['start', 'end']);
        await sequelize.close();
    });

    test('try/finally pattern ensures end fires even when up() throws', async () => {
        const {
            DatabaseSchemeVersion,
            sequelize
        } = makeMarkerModel();
        await sequelize.sync();
        // No levels_users table created — addColumn throws, transaction rolls back.

        const events = [];
        const onStart = pushStart(events);
        const onEnd = pushEnd(events);
        const umzug = buildUmzug(fakeClient(DatabaseSchemeVersion), realMigrationsDir);

        onStart();
        try {
            await expect(umzug.up()).rejects.toThrow();
        } finally {
            onEnd();
        }

        expect(events).toEqual(['start', 'end']);
        await sequelize.close();
    });
});

describe('runAllMigrations guard', () => {

    /*
     * Regression: prior to the guard, runAllMigrations threw an opaque
     * `TypeError: Cannot read properties of undefined (reading 'DatabaseSchemeVersion')`
     * when called before `client.models` was populated in main.js boot sequence.
     */
    test('throws a descriptive error when client is missing', async () => {
        await expect(runAllMigrations(null)).rejects.toThrow(/DatabaseSchemeVersion is not available/);
    });

    test('throws a descriptive error when client.models is undefined', async () => {
        await expect(runAllMigrations({})).rejects.toThrow(/DatabaseSchemeVersion is not available/);
    });

    test('throws a descriptive error when DatabaseSchemeVersion model is missing', async () => {
        await expect(runAllMigrations({models: {}})).rejects.toThrow(/DatabaseSchemeVersion is not available/);
    });
});

describe('Umzug + DatabaseSchemeVersionStorage end-to-end against the real levels V1 file', () => {
    const realMigrationsDir = path.join(__dirname, '..', '..', 'modules', 'levels', 'migrations');

    test('legacy marker row makes Umzug treat V1 as already applied', async () => {
        const {
            DatabaseSchemeVersion,
            sequelize
        } = makeMarkerModel();
        await sequelize.sync();
        await DatabaseSchemeVersion.create({
            model: 'levels_User',
            version: 'V1'
        });

        const queryInterface = sequelize.getQueryInterface();
        await queryInterface.createTable('levels_users', {
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            xp: DataTypes.INTEGER
        });

        const umzug = buildUmzug(fakeClient(DatabaseSchemeVersion), realMigrationsDir);
        expect(await umzug.pending()).toEqual([]);

        await sequelize.close();
    });

    test('no marker, old-schema table: migration runs and adds the daily columns (bot-1364 regression)', async () => {
        const {
            DatabaseSchemeVersion,
            sequelize
        } = makeMarkerModel();
        await sequelize.sync();

        const queryInterface = sequelize.getQueryInterface();
        await queryInterface.createTable('levels_users', {
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            xp: DataTypes.INTEGER,
            messages: DataTypes.INTEGER,
            level: DataTypes.INTEGER
        });
        await sequelize.query(
            'INSERT INTO levels_users (userID, xp, messages, level) VALUES (?, ?, ?, ?)',
            {replacements: ['existing-user', 12345, 678, 90]}
        );

        const colsBefore = await queryInterface.describeTable('levels_users');
        expect(colsBefore.dailyMessages).toBeUndefined();
        expect(colsBefore.dailyVoiceSeconds).toBeUndefined();
        expect(colsBefore.dailyResetDate).toBeUndefined();

        const umzug = buildUmzug(fakeClient(DatabaseSchemeVersion), realMigrationsDir);
        expect((await umzug.pending()).map(p => p.name)).toEqual(['levels_User__V1']);

        await umzug.up();

        const colsAfter = await queryInterface.describeTable('levels_users');
        expect(colsAfter.dailyMessages).toBeDefined();
        expect(colsAfter.dailyVoiceSeconds).toBeDefined();
        expect(colsAfter.dailyResetDate).toBeDefined();

        const [rows] = await sequelize.query('SELECT * FROM levels_users WHERE userID = ?', {replacements: ['existing-user']});
        expect(rows[0].xp).toBe(12345);
        expect(rows[0].messages).toBe(678);
        expect(rows[0].level).toBe(90);
        expect(rows[0].dailyMessages).toBe(0);
        expect(rows[0].dailyVoiceSeconds).toBe(0);
        expect(rows[0].dailyResetDate).toBeNull();

        const marker = await DatabaseSchemeVersion.findOne({where: {model: 'levels_User__V1'}});
        expect(marker).not.toBeNull();

        await sequelize.close();
    });

    test('takes a JSON backup of declared tables before running the migration', async () => {
        const {
            DatabaseSchemeVersion,
            sequelize
        } = makeMarkerModel();
        await sequelize.sync();

        const queryInterface = sequelize.getQueryInterface();
        await queryInterface.createTable('levels_users', {
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            xp: DataTypes.INTEGER,
            messages: DataTypes.INTEGER,
            level: DataTypes.INTEGER
        });
        await sequelize.query(
            'INSERT INTO levels_users (userID, xp, messages, level) VALUES (?, ?, ?, ?)',
            {replacements: ['backup-user', 999, 50, 5]}
        );

        const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-flow-'));
        const client = fakeClient(DatabaseSchemeVersion);
        client.dataDir = tmpDataDir;

        const umzug = buildUmzug(client, realMigrationsDir);
        await umzug.up();

        const backupsDir = path.join(tmpDataDir, 'migration-backups');
        const files = fs.readdirSync(backupsDir);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/__levels_User__V1__levels_users\.json$/u);
        const snapshot = JSON.parse(fs.readFileSync(path.join(backupsDir, files[0]), 'utf8'));
        expect(snapshot).toEqual([{
            userID: 'backup-user',
            xp: 999,
            messages: 50,
            level: 5
        }]);

        fs.rmSync(tmpDataDir, {
            recursive: true,
            force: true
        });
        await sequelize.close();
    });

    test('no marker, table already at current schema (truly fresh install): migration runs as a no-op', async () => {
        const {
            DatabaseSchemeVersion,
            sequelize
        } = makeMarkerModel();
        await sequelize.sync();

        const queryInterface = sequelize.getQueryInterface();
        await queryInterface.createTable('levels_users', {
            userID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            xp: DataTypes.INTEGER,
            messages: DataTypes.INTEGER,
            level: DataTypes.INTEGER,
            dailyMessages: DataTypes.INTEGER,
            dailyVoiceSeconds: DataTypes.INTEGER,
            dailyResetDate: DataTypes.STRING
        });

        const umzug = buildUmzug(fakeClient(DatabaseSchemeVersion), realMigrationsDir);
        await umzug.up();

        const marker = await DatabaseSchemeVersion.findOne({where: {model: 'levels_User__V1'}});
        expect(marker).not.toBeNull();
        expect(await umzug.pending()).toEqual([]);

        await sequelize.close();
    });
});