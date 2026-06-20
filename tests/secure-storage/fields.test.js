const {ENCRYPTED_FIELDS, resolveModel, VALID_TYPES} = require('../../src/functions/secure-storage/fields');

describe('secure-storage fields registry', () => {
    test('only open, non-moderation modules are listed', () => {
        const modules = ENCRYPTED_FIELDS.map(e => e.module);
        expect(modules).not.toContain('moderation');
        for (const closed of ['anonymous-chat', 'anti-nuke', 'applications', 'birthday', 'giveaways', 'one-word-story', 'ai-chat-channel']) {
            expect(modules).not.toContain(closed);
        }
    });
    test('no closed core models listed', () => {
        const names = ENCRYPTED_FIELDS.map(e => e.model);
        expect(names).not.toContain('ScheduledMessage');
        expect(names).not.toContain('ActionAuditLog');
    });
    test('every field type is valid', () => {
        for (const e of ENCRYPTED_FIELDS) {
            expect(Object.keys(e.fields).length).toBeGreaterThan(0);
            for (const t of Object.values(e.fields)) expect(VALID_TYPES).toContain(t);
        }
    });
    test('every entry has a name and model', () => {
        for (const e of ENCRYPTED_FIELDS) {
            expect(typeof e.name).toBe('string');
            expect(typeof e.model).toBe('string');
        }
    });
    test('resolveModel reaches module and core models', () => {
        const models = {suggestions: {Suggestion: 'S'}, ChannelLock: 'C'};
        expect(resolveModel(models, {module: 'suggestions', model: 'Suggestion'})).toBe('S');
        expect(resolveModel(models, {module: null, model: 'ChannelLock'})).toBe('C');
        expect(resolveModel(models, {module: 'missing', model: 'X'})).toBeUndefined();
        expect(resolveModel(null, {module: 'x', model: 'y'})).toBeNull();
    });
});
