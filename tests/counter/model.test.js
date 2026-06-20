/*
 * Schema test for the counter CountChannel model. Stubs Model.init to inspect
 * the attribute map + options: table name, the channelID primary key, the
 * userCounts JSON column with its {} default, and the module/name config.
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

test('CountChannel model', () => {
    const {
        mod,
        attributes,
        options
    } = loadModel('../../modules/counter/models/CountChannel');
    expect(options.tableName).toBe('counter_countChannel');
    expect(attributes.channelID.primaryKey).toBe(true);
    expect(Object.keys(attributes)).toEqual(
        expect.arrayContaining(['channelID', 'currentNumber', 'lastCountedUser', 'userCounts'])
    );
    expect(attributes.userCounts.defaultValue).toEqual({});
    expect(mod.config).toEqual({
        name: 'CountChannel',
        module: 'counter'
    });
});