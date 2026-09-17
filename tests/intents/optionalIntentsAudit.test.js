const fs = require('fs');
const path = require('path');
const {PRIVILEGED_INTENTS} = require('../../src/functions/intents');

const modulesDir = path.join(__dirname, '..', '..', 'modules');

describe('optionalIntents audit well-formedness', () => {
    const dirs = fs.readdirSync(modulesDir).filter(d => fs.existsSync(path.join(modulesDir, d, 'module.json')));
    for (const d of dirs) {
        test(`${d}: optionalIntents is a subset of declared privileged intents`, () => {
            const j = JSON.parse(fs.readFileSync(path.join(modulesDir, d, 'module.json')));
            const optional = j.optionalIntents || [];
            expect(Array.isArray(optional)).toBe(true);
            for (const o of optional) {
                expect(PRIVILEGED_INTENTS).toContain(o);       // only privileged intents are gatable
                expect(j.intents || []).toContain(o);          // must actually be declared
            }
        });
    }

    test('status-roles keeps GuildPresences required (regression anchor)', () => {
        const j = JSON.parse(fs.readFileSync(path.join(modulesDir, 'status-roles', 'module.json')));
        expect(j.optionalIntents || []).not.toContain('GuildPresences');
    });

    test('team-list marks GuildPresences optional (cosmetic status dots)', () => {
        const j = JSON.parse(fs.readFileSync(path.join(modulesDir, 'team-list', 'module.json')));
        expect(j.optionalIntents).toContain('GuildPresences');
    });
});
