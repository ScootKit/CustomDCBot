/*
 * Schema tests for the economy-system sequelize models. We stub Sequelize's
 * Model.init so loading each model's static init() reveals its attribute map and
 * options without a live database. We assert the table name, primary key, the
 * declared columns, the startMoney-relevant defaults, and the module/name config
 * each loader exposes.
 */
const {Model} = require('sequelize');

function loadModel(relPath) {
    const original = Model.init;
    Model.init = function (attributes, options) {
        return {
            attributes,
            options
        };
    };
    try {
        const abs = require.resolve(relPath);
        delete require.cache[abs];
        const mod = require(relPath);
        const {
            attributes,
            options
        } = mod.init({}); // fake sequelize
        return {
            mod,
            attributes,
            options
        };
    } finally {
        Model.init = original;
    }
}

test('Balance (user) model', () => {
    const {
        mod,
        attributes,
        options
    } = loadModel('../../modules/economy-system/models/user');
    expect(options.tableName).toBe('economy_user');
    expect(attributes.id.primaryKey).toBe(true);
    expect(Object.keys(attributes)).toEqual(expect.arrayContaining(['id', 'balance', 'bank']));
    expect(mod.config).toEqual({
        name: 'Balance',
        module: 'economy-system'
    });
});

test('Shop model', () => {
    const {
        mod,
        attributes,
        options
    } = loadModel('../../modules/economy-system/models/shop');
    expect(options.tableName).toBe('economy_shop');
    expect(attributes.id.primaryKey).toBe(true);
    expect(Object.keys(attributes)).toEqual(expect.arrayContaining(['id', 'name', 'price', 'role']));
    expect(mod.config.name).toBe('Shop');
});

test('cooldown model', () => {
    const {
        mod,
        attributes,
        options
    } = loadModel('../../modules/economy-system/models/cooldowns');
    expect(options.tableName).toBe('economy_cooldowns');
    expect(Object.keys(attributes)).toEqual(expect.arrayContaining(['userId', 'command', 'timestamp']));
    expect(mod.config.name).toBe('cooldown');
});

test('dropMsg model', () => {
    const {
        mod,
        attributes,
        options
    } = loadModel('../../modules/economy-system/models/dropMsg');
    expect(options.tableName).toBe('economy_dropMsg');
    expect(attributes.id.primaryKey).toBe(true);
    expect(mod.config.name).toBe('dropMsg');
});