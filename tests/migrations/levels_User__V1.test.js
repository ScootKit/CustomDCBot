const path = require('path');
const {
    Sequelize,
    DataTypes
} = require('sequelize');

const migration = require(path.join('..', '..', 'modules', 'levels', 'migrations', 'levels_User__V1.js'));

function makeSequelize() {
    return new Sequelize({dialect: 'sqlite', storage: ':memory:', logging: false});
}

async function createLegacyLevelsTable(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('levels_users', {
        userID: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        xp: DataTypes.INTEGER,
        messages: DataTypes.INTEGER,
        level: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });
}

describe('levels_User__V1 migration', () => {
    test('up() adds the three daily-stats columns', async () => {
        const sequelize = makeSequelize();
        await createLegacyLevelsTable(sequelize);

        await sequelize.query(
            'INSERT INTO levels_users (userID, xp, messages, level, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
            {replacements: ['123', 500, 10, 5, new Date().toISOString(), new Date().toISOString()]}
        );

        const queryInterface = sequelize.getQueryInterface();
        await migration.up({
            context: {
                queryInterface,
                sequelize
            }
        });

        const cols = await queryInterface.describeTable('levels_users');
        expect(cols.dailyMessages).toBeDefined();
        expect(cols.dailyVoiceSeconds).toBeDefined();
        expect(cols.dailyResetDate).toBeDefined();

        const [rows] = await sequelize.query('SELECT * FROM levels_users WHERE userID = ?', {replacements: ['123']});
        expect(rows[0].xp).toBe(500);
        expect(rows[0].messages).toBe(10);
        expect(rows[0].level).toBe(5);
        expect(rows[0].dailyMessages).toBe(0);
        expect(rows[0].dailyVoiceSeconds).toBe(0);
        expect(rows[0].dailyResetDate).toBeNull();

        await sequelize.close();
    });

    test('up() is idempotent — re-running it on an already-migrated table is a no-op', async () => {
        const sequelize = makeSequelize();
        await createLegacyLevelsTable(sequelize);

        const queryInterface = sequelize.getQueryInterface();
        await migration.up({
            context: {
                queryInterface,
                sequelize
            }
        });
        await migration.up({
            context: {
                queryInterface,
                sequelize
            }
        });

        const cols = await queryInterface.describeTable('levels_users');
        expect(cols.dailyMessages).toBeDefined();

        await sequelize.close();
    });

    test('down() removes the three daily-stats columns', async () => {
        const sequelize = makeSequelize();
        await createLegacyLevelsTable(sequelize);

        const queryInterface = sequelize.getQueryInterface();
        await migration.up({
            context: {
                queryInterface,
                sequelize
            }
        });
        await migration.down({
            context: {
                queryInterface,
                sequelize
            }
        });

        const cols = await queryInterface.describeTable('levels_users');
        expect(cols.dailyMessages).toBeUndefined();
        expect(cols.dailyVoiceSeconds).toBeUndefined();
        expect(cols.dailyResetDate).toBeUndefined();

        await sequelize.close();
    });

    test('preserves existing row data through up()', async () => {
        const sequelize = makeSequelize();
        await createLegacyLevelsTable(sequelize);

        await sequelize.query(
            'INSERT INTO levels_users (userID, xp, messages, level) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
            {replacements: ['u1', 1000, 50, 7, 'u2', 2000, 100, 14]}
        );

        const queryInterface = sequelize.getQueryInterface();
        await migration.up({
            context: {
                queryInterface,
                sequelize
            }
        });

        const [rows] = await sequelize.query('SELECT userID, xp, messages, level FROM levels_users ORDER BY userID');
        expect(rows).toEqual([
            {
                userID: 'u1',
                xp: 1000,
                messages: 50,
                level: 7
            },
            {
                userID: 'u2',
                xp: 2000,
                messages: 100,
                level: 14
            }
        ]);

        await sequelize.close();
    });
});