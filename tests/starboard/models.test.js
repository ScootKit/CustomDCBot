/*
 * Schema tests for the starboard sequelize models (StarMsg, StarUser).
 *
 * sequelize is mocked so each model's static init() just records the attribute
 * map + options, letting us assert the persisted column set, table names,
 * timestamps flag and the loader config without a real database.
 */

jest.mock('sequelize', () => {
    const DataTypes = new Proxy({}, {get: (_t, prop) => ({__type: prop})});

    class Model {
        static init(attributes, options) {
            this._attributes = attributes;
            this._options = options;
            return this;
        }
    }

    return {
        DataTypes,
        Model
    };
});

function load(name) {
    const mod = require(`../../modules/starboard/models/${name}`);
    mod.init({});
    return {
        attributes: mod._attributes,
        options: mod._options,
        config: mod.config
    };
}

describe('starboard models', () => {
    test('StarMsg maps a source message to its starboard message', () => {
        const {
            attributes,
            options,
            config
        } = load('StarMsg');
        expect(Object.keys(attributes).sort()).toEqual(['msgId', 'starMsg']);
        expect(options.tableName).toBe('starboard_StarMsg');
        expect(options.timestamps).toBe(true);
        expect(config).toEqual({
            name: 'StarMsg',
            module: 'starboard'
        });
    });

    test('StarUser records who starred which message (for rate limiting)', () => {
        const {
            attributes,
            options,
            config
        } = load('StarUser');
        expect(Object.keys(attributes).sort()).toEqual(['msgId', 'userId']);
        expect(options.tableName).toBe('starboard_StarUser');
        expect(options.timestamps).toBe(true);
        expect(config).toEqual({
            name: 'StarUser',
            module: 'starboard'
        });
    });
});