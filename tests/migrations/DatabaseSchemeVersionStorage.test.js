const {
    Sequelize,
    DataTypes,
    Model
} = require('sequelize');
const DatabaseSchemeVersionStorage = require('../../src/functions/migrations/DatabaseSchemeVersionStorage');
const {
    parseMigrationName,
    versionNumber
} = DatabaseSchemeVersionStorage;

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

describe('parseMigrationName', () => {
    test('splits on the last double-underscore', () => {
        expect(parseMigrationName('levels_User__V1')).toEqual({
            model: 'levels_User',
            version: 'V1'
        });
        expect(parseMigrationName('staff-management-system_ActivityCheck__V3')).toEqual({
            model: 'staff-management-system_ActivityCheck',
            version: 'V3'
        });
    });

    test('returns null when the name has no separator', () => {
        expect(parseMigrationName('levels_User')).toBeNull();
    });
});

describe('versionNumber', () => {
    test.each([
        ['V1', 1],
        ['V12', 12],
        ['V0', 0]
    ])('parses %s', (input, expected) => {
        expect(versionNumber(input)).toBe(expected);
    });

    test.each(['v1', '1', 'V1a', '', 'applied'])('rejects %s', (input) => {
        expect(versionNumber(input)).toBeNull();
    });
});

describe('DatabaseSchemeVersionStorage', () => {
    let DatabaseSchemeVersion;
    let sequelize;
    let storage;

    beforeEach(async () => {
        ({
            DatabaseSchemeVersion,
            sequelize
        } = makeMarkerModel());
        await sequelize.sync();
        storage = new DatabaseSchemeVersionStorage({getModel: () => DatabaseSchemeVersion});
    });

    afterEach(async () => {
        await sequelize.close();
    });

    test('executed() is empty on a fresh table', async () => {
        expect(await storage.executed()).toEqual([]);
    });

    test('logMigration writes a new-format row', async () => {
        await storage.logMigration({name: 'levels_User__V1'});

        const row = await DatabaseSchemeVersion.findOne({where: {model: 'levels_User__V1'}});
        expect(row).not.toBeNull();
        expect(row.version).toBe('applied');
    });

    test('executed() returns new-format rows verbatim', async () => {
        await storage.logMigration({name: 'levels_User__V1'});
        await storage.logMigration({name: 'levels_User__V2'});

        expect((await storage.executed()).sort()).toEqual(['levels_User__V1', 'levels_User__V2']);
    });

    test('executed() expands a legacy row to all lower-numbered versions', async () => {
        await DatabaseSchemeVersion.create({
            model: 'birthday_User',
            version: 'V2'
        });

        expect((await storage.executed()).sort()).toEqual(['birthday_User__V1', 'birthday_User__V2']);
    });

    test('executed() merges legacy and new-format rows for the same model', async () => {
        await DatabaseSchemeVersion.create({
            model: 'levels_User',
            version: 'V1'
        });
        await storage.logMigration({name: 'levels_User__V2'});

        expect((await storage.executed()).sort()).toEqual(['levels_User__V1', 'levels_User__V2']);
    });

    test('executed() handles a legacy row with a non-numeric version by passing it through', async () => {
        await DatabaseSchemeVersion.create({
            model: 'odd_model',
            version: 'something-weird'
        });

        expect(await storage.executed()).toEqual(['odd_model__something-weird']);
    });

    test('unlogMigration removes the new-format row and any matching legacy row', async () => {
        await DatabaseSchemeVersion.create({
            model: 'levels_User',
            version: 'V1'
        });
        await storage.logMigration({name: 'levels_User__V1'});

        await storage.unlogMigration({name: 'levels_User__V1'});

        expect(await DatabaseSchemeVersion.findOne({where: {model: 'levels_User__V1'}})).toBeNull();
        expect(await DatabaseSchemeVersion.findOne({
            where: {
                model: 'levels_User',
                version: 'V1'
            }
        })).toBeNull();
    });

    test('logMigration is idempotent (upsert)', async () => {
        await storage.logMigration({name: 'levels_User__V1'});
        await storage.logMigration({name: 'levels_User__V1'});

        const rows = await DatabaseSchemeVersion.findAll({where: {model: 'levels_User__V1'}});
        expect(rows).toHaveLength(1);
    });
});