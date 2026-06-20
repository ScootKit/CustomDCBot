/*
 * Tests for the pure, declarative parts of the sequelize models:
 *   DatabaseSchemeVersion, ChannelLock.
 *
 * These models extend sequelize's Model and define their schema inside a
 * static init() that calls super.init(attributes, options). We mock the
 * `sequelize` package so that:
 *   - Model.init captures the (attributes, options) it was handed, and
 *   - DataTypes are simple sentinel objects we can assert identity against.
 * This lets us assert field definitions, primary keys, defaults and table
 * options without a real database.
 */

const captured = {};

jest.mock('sequelize', () => {
    const DataTypes = {
        STRING: {key: 'STRING'},
        INTEGER: {key: 'INTEGER'},
        JSON: {key: 'JSON'},
        DATE: {key: 'DATE'}
    };

    class Model {
        static init(attributes, options) {
            // Record what this concrete model defined, keyed by class name.
            captured[this.name] = {
                attributes,
                options
            };
            return this;
        }
    }

    return {
        DataTypes,
        Model
    };
});

const {DataTypes} = require('sequelize');

const DatabaseSchemeVersion = require('../../src/models/DatabaseSchemeVersion');
const ChannelLock = require('../../src/models/ChannelLock');

// A stand-in sequelize instance; the models only forward it into options.
const fakeSequelize = {dialect: 'sqlite'};

function define(model) {
    return model.init(fakeSequelize);
}

describe('models - exported shape', () => {
    test.each([
        ['DatabaseSchemeVersion', DatabaseSchemeVersion],
        ['ChannelLock', ChannelLock]
    ])('%s exports a config.name matching the model', (name, model) => {
        expect(model.config).toBeDefined();
        expect(model.config.name).toBe(name);
    });

    test.each([
        DatabaseSchemeVersion,
        ChannelLock
    ])('model is a class with a static init', (model) => {
        expect(typeof model).toBe('function');
        expect(typeof model.init).toBe('function');
    });

    test('init returns the model class (chainable)', () => {
        expect(define(ChannelLock)).toBe(ChannelLock);
    });
});

describe('models - DatabaseSchemeVersion schema', () => {
    let attrs, opts;
    beforeAll(() => {
        define(DatabaseSchemeVersion);
        ({
            attributes: attrs,
            options: opts
        } = captured.DatabaseSchemeVersion);
    });

    test('model is a STRING primary key', () => {
        expect(attrs.model).toEqual({
            type: DataTypes.STRING,
            primaryKey: true
        });
    });

    test('version is a plain STRING', () => {
        expect(attrs.version).toBe(DataTypes.STRING);
    });

    test('uses the system_ table prefix with timestamps', () => {
        expect(opts.tableName).toBe('system_DatabaseSchemeVersion');
        expect(opts.timestamps).toBe(true);
    });
});

describe('models - ChannelLock schema', () => {
    let attrs, opts;
    beforeAll(() => {
        define(ChannelLock);
        ({
            attributes: attrs,
            options: opts
        } = captured.ChannelLock);
    });

    test('id is a STRING primary key', () => {
        expect(attrs.id).toEqual({
            type: DataTypes.STRING,
            primaryKey: true
        });
    });

    test('permissions is JSON', () => {
        expect(attrs.permissions).toBe(DataTypes.JSON);
    });

    test('lockReason is TEXT', () => {
        expect(attrs.lockReason).toBe(DataTypes.TEXT);
    });

    test('table name and timestamps', () => {
        expect(opts.tableName).toBe('system_ChannelLock');
        expect(opts.timestamps).toBe(true);
    });
});
