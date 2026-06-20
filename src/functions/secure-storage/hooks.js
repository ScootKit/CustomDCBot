/*
 * Type-aware Sequelize hooks that (de)serialize the registered secure-storage columns. Those columns
 * are declared TEXT, so the hook turns objects/numbers into their stored string form on write and back
 * on read, in both standard mode (here) and the managed backend (where it is also encrypted).
 */
const {encryptField, decryptField} = require('./fieldCrypto');
const {ENCRYPTED_FIELDS, resolveModel} = require('./fields');

const hookedModels = new WeakSet();
const fieldRegistry = new Map();

function serialize(value, type) {
    if (value === null || typeof value === 'undefined') return value;
    if (type === 'json') return JSON.stringify(value);
    if (type === 'int') return String(value);
    return value;
}

function deserialize(str, type) {
    if (str === null || typeof str === 'undefined') return str;
    if (type === 'json') {
        try {
            return JSON.parse(str);
        } catch {
            return str;
        }
    }
    if (type === 'int') {
        const n = parseInt(str, 10);
        return Number.isNaN(n) ? null : n;
    }
    return str;
}

function readField(target, field) {
    return typeof target.getDataValue === 'function' ? target.getDataValue(field) : target[field];
}

function writeField(target, field, value) {
    if (typeof target.setDataValue === 'function') target.setDataValue(field, value);
    else target[field] = value;
}

function encryptTarget(target, fields) {
    if (!target) return;
    for (const [field, type] of Object.entries(fields)) {
        const v = readField(target, field);
        if (v === null || typeof v === 'undefined') continue;
        writeField(target, field, encryptField(serialize(v, type)));
    }
}

function decryptTarget(target, fields) {
    if (!target) return;
    for (const [field, type] of Object.entries(fields)) {
        const v = readField(target, field);
        if (v === null || typeof v === 'undefined') continue;
        writeField(target, field, deserialize(decryptField(v), type));
    }
}

/*
 * Sequelize does not fire a child model's afterFind for eagerly loaded rows, so a parent's afterFind
 * decrypts included children itself, looking up each by its constructor in fieldRegistry.
 */
function decryptInstanceDeep(instance, seen) {
    if (!instance || typeof instance !== 'object') return;
    if (seen.has(instance)) return;
    seen.add(instance);
    const reg = instance.constructor && fieldRegistry.get(instance.constructor);
    if (reg) decryptTarget(instance, reg.fields);
    const options = instance['_options'];
    const includeNames = options && options.includeNames;
    if (!Array.isArray(includeNames)) return;
    for (const name of includeNames) {
        const assoc = instance[name];
        if (!assoc) continue;
        if (Array.isArray(assoc)) for (const child of assoc) decryptInstanceDeep(child, seen);
        else decryptInstanceDeep(assoc, seen);
    }
}

function applyEncryption(model, fields) {
    if (hookedModels.has(model)) return false;
    hookedModels.add(model);
    fieldRegistry.set(model, {fields});

    function enc(instance) {
        encryptTarget(instance, fields);
    }

    function dec(instance) {
        decryptTarget(instance, fields);
    }

    model.beforeValidate(enc);
    model.beforeBulkCreate((instances) => {
        for (const i of instances) enc(i);
    });
    model.beforeUpsert((values) => encryptTarget(values, fields));
    model.beforeBulkUpdate((options) => encryptTarget(options && options.attributes, fields));

    model.afterFind((result) => {
        if (!result) return;
        const seen = new Set();
        if (Array.isArray(result)) for (const r of result) decryptInstanceDeep(r, seen);
        else decryptInstanceDeep(result, seen);
    });
    model.afterCreate(dec);
    model.afterUpdate(dec);
    model.afterBulkCreate((instances) => {
        for (const i of instances) dec(i);
    });
    model.afterUpsert((result) => dec(result[0]));
    return true;
}

function registerEncryptionHooks(models, {
    warn = () => {
    }
} = {}) {
    const applied = [];
    for (const entry of ENCRYPTED_FIELDS) {
        const model = resolveModel(models, entry);
        if (!model) {
            warn(`[secure-storage] model not found for ${entry.module || '(core)'}/${entry.model}; skipping`);
            continue;
        }
        if (applyEncryption(model, entry.fields)) applied.push(entry.name);
    }
    return applied;
}

module.exports = {
    serialize,
    deserialize,
    encryptTarget,
    decryptTarget,
    decryptInstanceDeep,
    applyEncryption,
    registerEncryptionHooks
};