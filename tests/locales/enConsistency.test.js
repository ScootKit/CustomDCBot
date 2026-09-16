/*
 * Keeps locales/en.json in sync with the code that reads it.
 *
 * localize() THROWS on a missing key (src/functions/localize.js), so a typo is a runtime crash
 * rather than a fallback - and the unit tests cannot catch it, because they mock localize to echo
 * `section.key`. This suite reads the real sources instead and cross-checks both directions:
 *   - every statically resolvable localize('section', 'key') has an entry
 *   - every section and key in en.json is still referenced by shipped code
 *
 * Arguments that are not a plain string literal (`localize('boostTier', guild.premiumTier)`,
 * `localize('emoji-quiz', 'point' + suffix)`) cannot be resolved here, so the section they belong to
 * is exempt from the unused-key check rather than being reported as missing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage']);

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(p, out);
        } else if (entry.name.endsWith('.js')) out.push(p);
    }
    return out;
}

/**
 * Reads one argument starting at `i`. Returns the literal's value only when the argument is exactly
 * one string literal followed by `,` or `)` - so a concatenation or an identifier yields null.
 * @param {String} src Source text
 * @param {Number} i Index of the first character of the argument
 * @returns {{value: String|null, end: Number}} Literal value (null when not static) and the index of the delimiter
 */
function readArgument(src, i) {
    while (i < src.length && /\s/u.test(src[i])) i++;
    const quote = src[i];
    if (quote !== '\'' && quote !== '"') return {
        value: null,
        end: i
    };
    let j = i + 1;
    let value = '';
    while (j < src.length) {
        if (src[j] === '\\') {
            value += src[j + 1];
            j += 2;
            continue;
        }
        if (src[j] === quote) break;
        value += src[j];
        j++;
    }
    if (j >= src.length) return {
        value: null,
        end: j
    };
    let k = j + 1;
    while (k < src.length && /\s/u.test(src[k])) k++;
    // Anything other than a delimiter here means the literal was part of a larger expression.
    if (src[k] !== ',' && src[k] !== ')') return {
        value: null,
        end: k
    };
    return {
        value,
        end: k
    };
}

// `localize` is aliased to `loc` in main.js.
const CALL = /\b(?:localize|loc)\s*\(/gu;

function scanSources() {
    const used = new Map();
    const dynamicKeySections = new Set();
    const files = [
        ...walk(path.join(ROOT, 'src')),
        ...walk(path.join(ROOT, 'modules')),
        path.join(ROOT, 'main.js')
    ];
    for (const file of files) {
        // localize.js declares the function; its own `localize(file, string)` is not a call site.
        if (file.endsWith(path.join('functions', 'localize.js'))) continue;
        const src = fs.readFileSync(file, 'utf8');
        CALL.lastIndex = 0;
        let m;
        while ((m = CALL.exec(src)) !== null) {
            const section = readArgument(src, m.index + m[0].length);
            if (section.value === null || src[section.end] !== ',') continue;
            if (!used.has(section.value)) used.set(section.value, new Set());
            const key = readArgument(src, section.end + 1);
            if (key.value === null) dynamicKeySections.add(section.value);
            else used.get(section.value).add(key.value);
        }
    }
    return {
        used,
        dynamicKeySections
    };
}

const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'en.json'), 'utf8'));
const {
    used,
    dynamicKeySections
} = scanSources();

describe('locales/en.json covers every string the code asks for', () => {
    test('no localize() call references a missing section', () => {
        const missing = [...used.keys()].filter(s => !en[s]).sort();
        expect(missing).toEqual([]);
    });

    test('no localize() call references a missing key', () => {
        const missing = [];
        for (const [section, keys] of used) {
            if (!en[section]) continue;
            for (const key of keys) if (!(key in en[section])) missing.push(`${section}.${key}`);
        }
        expect(missing.sort()).toEqual([]);
    });
});

describe('locales/en.json carries no strings this repo cannot use', () => {
    test('every section is referenced by shipped code', () => {
        const orphans = Object.keys(en).filter(s => !used.has(s)).sort();
        expect(orphans).toEqual([]);
    });

    test('every key in a statically resolvable section is referenced', () => {
        const unused = [];
        for (const [section, entries] of Object.entries(en)) {
            if (!used.has(section) || dynamicKeySections.has(section)) continue;
            for (const key of Object.keys(entries)) {
                if (!used.get(section).has(key)) unused.push(`${section}.${key}`);
            }
        }
        expect(unused.sort()).toEqual([]);
    });
});
