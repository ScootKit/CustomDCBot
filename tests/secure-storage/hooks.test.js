const hooks = require('../../src/functions/secure-storage/hooks');

describe('serialize/deserialize', () => {
    test('json round-trips through a string', () => {
        const s = hooks.serialize({a: 1, b: [2, 3]}, 'json');
        expect(typeof s).toBe('string');
        expect(hooks.deserialize(s, 'json')).toEqual({a: 1, b: [2, 3]});
    });
    test('int round-trips', () => {
        expect(hooks.serialize(42, 'int')).toBe('42');
        expect(hooks.deserialize('42', 'int')).toBe(42);
        expect(hooks.deserialize('notnum', 'int')).toBeNull();
    });
    test('string passes through; null/undefined preserved', () => {
        expect(hooks.serialize('x', 'string')).toBe('x');
        expect(hooks.serialize(null, 'json')).toBeNull();
        expect(hooks.serialize(undefined, 'int')).toBeUndefined();
        expect(hooks.deserialize(null, 'json')).toBeNull();
        expect(hooks.deserialize(undefined, 'json')).toBeUndefined();
        expect(hooks.deserialize('plain', 'string')).toBe('plain');
    });
    test('deserialize json tolerates non-JSON without throwing', () => {
        expect(hooks.deserialize('not json', 'json')).toBe('not json');
    });
});

describe('encryptTarget/decryptTarget on a plain object', () => {
    const fields = {data: 'json', note: 'string', count: 'int'};
    test('encrypt serializes then decrypt restores', () => {
        const row = {data: {x: 1}, note: 'hi', count: 7};
        hooks.encryptTarget(row, fields);
        expect(typeof row.data).toBe('string');
        expect(row.count).toBe('7');
        hooks.decryptTarget(row, fields);
        expect(row.data).toEqual({x: 1});
        expect(row.note).toBe('hi');
        expect(row.count).toBe(7);
    });
    test('null/undefined fields are skipped', () => {
        const row = {data: null, note: undefined, count: 1};
        hooks.encryptTarget(row, fields);
        expect(row.data).toBeNull();
        expect(row.note).toBeUndefined();
    });
    test('null target is a safe no-op', () => {
        expect(() => hooks.encryptTarget(null, fields)).not.toThrow();
        expect(() => hooks.decryptTarget(undefined, fields)).not.toThrow();
    });
});

function fakeModel(name) {
    const handlers = {};
    const reg = (k) => (fn) => {
        handlers[k] = handlers[k] || [];
        handlers[k].push(fn);
    };
    return {
        name,
        beforeValidate: reg('beforeValidate'),
        beforeBulkCreate: reg('beforeBulkCreate'),
        beforeUpsert: reg('beforeUpsert'),
        beforeBulkUpdate: reg('beforeBulkUpdate'),
        afterFind: reg('afterFind'),
        afterCreate: reg('afterCreate'),
        afterUpdate: reg('afterUpdate'),
        afterBulkCreate: reg('afterBulkCreate'),
        afterUpsert: reg('afterUpsert'),
        _handlers: handlers
    };
}

describe('applyEncryption + registerEncryptionHooks', () => {
    test('applyEncryption is idempotent', () => {
        const m = fakeModel('M');
        expect(hooks.applyEncryption(m, {data: 'json'})).toBe(true);
        expect(hooks.applyEncryption(m, {data: 'json'})).toBe(false);
    });

    test('beforeValidate serializes and afterFind deserializes (with eager include)', () => {
        const child = fakeModel('Child');
        hooks.applyEncryption(child, {note: 'string'});
        const m = fakeModel('M2');
        hooks.applyEncryption(m, {data: 'json'});

        const childInst = {note: 'n', constructor: child};
        const inst = {
            data: {a: 1},
            constructor: m,
            _options: {includeNames: ['kid']},
            kid: childInst
        };
        m._handlers.beforeValidate[0](inst);
        expect(typeof inst.data).toBe('string');
        m._handlers.afterFind[0](inst);
        expect(inst.data).toEqual({a: 1});
    });

    test('afterFind handles arrays, null, and array-valued includes', () => {
        const m = fakeModel('M3');
        hooks.applyEncryption(m, {data: 'json'});
        const find = m._handlers.afterFind[0];
        expect(() => find(null)).not.toThrow();
        const a = {data: '{"v":1}', constructor: m, _options: {includeNames: ['list']}, list: [null]};
        find([a]);
        expect(a.data).toEqual({v: 1});
    });

    test('write/read sibling hooks operate without throwing', () => {
        const m = fakeModel('M4');
        hooks.applyEncryption(m, {data: 'json'});
        const inst = {data: {z: 9}, constructor: m};
        m._handlers.beforeBulkCreate[0]([inst]);
        expect(typeof inst.data).toBe('string');
        m._handlers.afterBulkCreate[0]([inst]);
        expect(inst.data).toEqual({z: 9});

        const values = {data: {q: 1}};
        m._handlers.beforeUpsert[0](values);
        expect(typeof values.data).toBe('string');
        m._handlers.afterUpsert[0]([{data: values.data, constructor: m}]);

        const opts = {attributes: {data: {k: 2}}};
        m._handlers.beforeBulkUpdate[0](opts);
        expect(typeof opts.attributes.data).toBe('string');
        m._handlers.beforeBulkUpdate[0]({});

        const created = {data: '{"c":3}', constructor: m};
        m._handlers.afterCreate[0](created);
        expect(created.data).toEqual({c: 3});
        const updated = {data: '{"u":4}', constructor: m};
        m._handlers.afterUpdate[0](updated);
        expect(updated.data).toEqual({u: 4});
    });

    test('getDataValue/setDataValue style targets are supported', () => {
        const store = {data: {s: 1}};
        const inst = {
            getDataValue: (f) => store[f],
            setDataValue: (f, v) => {
                store[f] = v;
            }
        };
        hooks.encryptTarget(inst, {data: 'json'});
        expect(typeof store.data).toBe('string');
        hooks.decryptTarget(inst, {data: 'json'});
        expect(store.data).toEqual({s: 1});
    });

    test('registerEncryptionHooks warns on missing model and applies present ones', () => {
        const warns = [];
        const present = fakeModel('Suggestion');
        const models = {suggestions: {Suggestion: present}};
        const applied = hooks.registerEncryptionHooks(models, {warn: (mm) => warns.push(mm)});
        expect(applied).toContain('Suggestion');
        expect(warns.length).toBeGreaterThan(0);
    });

    test('registerEncryptionHooks default warn does not throw', () => {
        expect(() => hooks.registerEncryptionHooks({})).not.toThrow();
    });

    test('registerEncryptionHooks skips an already-hooked model', () => {
        const present = fakeModel('Suggestion');
        const models = {suggestions: {Suggestion: present}};
        expect(hooks.registerEncryptionHooks(models)).toContain('Suggestion');
        expect(hooks.registerEncryptionHooks(models)).not.toContain('Suggestion');
    });

    test('decryptInstanceDeep handles seen-guard, unregistered constructors, and null includes', () => {
        const m = fakeModel('MDeep');
        hooks.applyEncryption(m, {data: 'json'});

        function Unreg() {
        }

        const unregistered = {data: '{"u":1}', constructor: Unreg};
        const shared = {
            data: '{"s":1}',
            constructor: m,
            _options: {includeNames: ['child']},
            child: unregistered
        };
        const parent = {
            data: '{"p":1}',
            constructor: m,
            _options: {includeNames: ['a', 'b', 'missing']},
            a: shared,
            b: shared,
            missing: null
        };
        hooks.decryptInstanceDeep(parent, new Set());
        expect(parent.data).toEqual({p: 1});
        expect(shared.data).toEqual({s: 1});
        expect(unregistered.data).toBe('{"u":1}');
    });
});