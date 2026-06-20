/*
 * Covers modules/color-me/models/Role.js: the Sequelize init wiring (auto-
 * increment integer PK, colorme_Role table, timestamps) and the model config
 * export. super.init is patched to capture the schema.
 */
const {DataTypes} = require('sequelize');
const Role = require('../../modules/color-me/models/Role');

test('exposes the expected model config', () => {
    expect(Role.config).toEqual({
        name: 'Role',
        module: 'color-me'
    });
});

test('init defines the colorme_Role table with an auto-increment PK', () => {
    let captured;
    const proto = Object.getPrototypeOf(Role);
    const original = proto.init;
    proto.init = function (attrs, opts) {
        captured = {
            attrs,
            opts
        };
        return 'ok';
    };
    try {
        Role.init({});
    } finally {
        proto.init = original;
    }

    expect(captured.opts.tableName).toBe('colorme_Role');
    expect(captured.opts.timestamps).toBe(true);
    expect(captured.attrs.id).toMatchObject({
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER
    });
    expect(captured.attrs.userID).toBe(DataTypes.STRING);
    expect(captured.attrs.roleID).toBe(DataTypes.STRING);
    expect(captured.attrs.timestamp).toBe(DataTypes.DATE);
});