const {Sequelize, DataTypes, Model} = require('sequelize');
const {applyEncryption} = require('../../src/functions/secure-storage/hooks');

async function makeModel(columnType, name) {
    const sq = new Sequelize({dialect: 'sqlite', storage: ':memory:', logging: false});

    class Thing extends Model {
    }

    Thing.init({payload: columnType}, {sequelize: sq, modelName: name});
    applyEncryption(Thing, {payload: 'json'});
    await sq.sync();
    return {sq, Thing};
}

test('object round-trips through a TEXT column with hooks installed', async () => {
    const {sq, Thing} = await makeModel(DataTypes.TEXT, 'ThingText');
    await Thing.create({payload: {a: 1, b: [2, 3]}});
    const row = await Thing.findOne();
    expect(row.payload).toEqual({a: 1, b: [2, 3]});
    await sq.close();
});

test('object round-trips through a legacy physical JSON column without a guard', async () => {
    const {sq, Thing} = await makeModel(DataTypes.JSON, 'ThingJson');
    await Thing.create({payload: {a: 1}});
    const row = await Thing.findOne();
    expect(row.payload).toEqual({a: 1});
    await sq.close();
});

test('null payload stays null', async () => {
    const {sq, Thing} = await makeModel(DataTypes.TEXT, 'ThingNull');
    await Thing.create({payload: null});
    const row = await Thing.findOne();
    expect(row.payload).toBeNull();
    await sq.close();
});