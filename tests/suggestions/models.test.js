/*
 * Schema test for the suggestions Suggestion model.
 *
 * sequelize is mocked so init() records the schema. We assert the auto-increment
 * primary key, the JSON columns (comments / adminAnswer) the embed logic depends
 * on, the table name and the loader config.
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

describe('suggestions Suggestion model', () => {
    test('has an autoIncrement PK, JSON comments, and a TEXT secure-storage answer column', () => {
        const mod = require('../../modules/suggestions/models/Suggestion');
        mod.init({});
        expect(mod._attributes.id.primaryKey).toBe(true);
        expect(mod._attributes.id.autoIncrement).toBe(true);
        expect(mod._attributes.comments.__type).toBe('JSON');
        // adminAnswer is a secure-storage field: declared TEXT, JSON (de)serialized by the hooks.
        expect(mod._attributes.adminAnswer.__type).toBe('TEXT');
        expect(mod._options.tableName).toBe('suggestions_Suggestion');
        expect(mod._options.timestamps).toBe(true);
        expect(mod.config).toEqual({
            name: 'Suggestion',
            module: 'suggestions'
        });
    });
});