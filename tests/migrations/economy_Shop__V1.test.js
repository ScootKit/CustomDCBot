const path = require('path');
const {Sequelize} = require('sequelize');

const migration = require(path.join('..', '..', 'modules', 'economy-system', 'migrations', 'economy_Shop__V1.js'));

function makeSequelize() {
    return new Sequelize({dialect: 'sqlite', storage: ':memory:', logging: false});
}

describe('economy_Shop__V1 migration', () => {
    test('pre-V1 schema (name as PK, no id column): table is rebuilt with id PK and existing rows survive', async () => {
        const sequelize = makeSequelize();
        const queryInterface = sequelize.getQueryInterface();

        await sequelize.query(`CREATE TABLE economy_shop (
            name VARCHAR(255) PRIMARY KEY,
            price INTEGER,
            role TEXT,
            "createdAt" DATETIME,
            "updatedAt" DATETIME
        )`);
        const now = new Date().toISOString();
        await sequelize.query(
            'INSERT INTO economy_shop (name, price, role, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
            {replacements: ['sword', 100, 'role1', now, now, 'shield', 50, 'role2', now, now]}
        );

        await migration.up({
            context: {
                queryInterface,
                sequelize
            }
        });

        const cols = await queryInterface.describeTable('economy_shop');
        expect(cols.id).toBeDefined();
        expect(cols.name).toBeDefined();
        expect(cols.price).toBeDefined();
        expect(cols.role).toBeDefined();

        const [rows] = await sequelize.query('SELECT id, name, price, role FROM economy_shop ORDER BY name');
        expect(rows).toEqual([
            {
                id: 'shield',
                name: 'shield',
                price: 50,
                role: 'role2'
            },
            {
                id: 'sword',
                name: 'sword',
                price: 100,
                role: 'role1'
            }
        ]);

        await sequelize.close();
    });

    test('post-V1 schema (id already present): migration is a no-op', async () => {
        const sequelize = makeSequelize();
        const queryInterface = sequelize.getQueryInterface();

        await sequelize.query(`CREATE TABLE economy_shop (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255),
            price INTEGER,
            role TEXT,
            "createdAt" DATETIME,
            "updatedAt" DATETIME
        )`);
        const now = new Date().toISOString();
        await sequelize.query(
            'INSERT INTO economy_shop (id, name, price, role, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
            {replacements: ['custom-id', 'sword', 100, 'role1', now, now]}
        );

        await migration.up({
            context: {
                queryInterface,
                sequelize
            }
        });

        const [rows] = await sequelize.query('SELECT id, name FROM economy_shop');
        expect(rows).toEqual([{
            id: 'custom-id',
            name: 'sword'
        }]);

        await sequelize.close();
    });

    test('idempotent: running twice on a pre-V1 schema rebuilds once, second run is a no-op', async () => {
        const sequelize = makeSequelize();
        const queryInterface = sequelize.getQueryInterface();

        await sequelize.query(`CREATE TABLE economy_shop (
            name VARCHAR(255) PRIMARY KEY,
            price INTEGER,
            role TEXT,
            "createdAt" DATETIME,
            "updatedAt" DATETIME
        )`);
        await sequelize.query(
            'INSERT INTO economy_shop (name, price, role) VALUES (?, ?, ?)',
            {replacements: ['sword', 100, 'role1']}
        );

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

        const [rows] = await sequelize.query('SELECT id, name FROM economy_shop');
        expect(rows).toEqual([{
            id: 'sword',
            name: 'sword'
        }]);

        await sequelize.close();
    });
});