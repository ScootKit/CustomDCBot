// parse-duration v2.x is ESM-only. Loading strategy by environment:
//   - Node 22.12+: require() of ESM works natively
//   - Older Node: require() throws ERR_REQUIRE_ESM, fall back to dynamic import
//   - jest: require() works through the test runner's module cache (mocks too)
// Callers stay synchronous (`durationParser('5m')`) after init() resolves.
// main.js MUST await init() during startup before any handler runs.

let parseFn = null;
let initPromise = null;

function extractFn(mod) {
    return (mod && mod.default) || mod;
}

function durationParser(input, format) {
    if (!parseFn) throw new Error('parseDuration used before init(); call require("src/functions/parseDuration").init() during startup');
    return parseFn(input, format);
}

durationParser.init = function init() {
    if (parseFn) return Promise.resolve();
    if (!initPromise) {
        try {
            parseFn = extractFn(require('parse-duration'));
            initPromise = Promise.resolve();
        } catch (requireError) {
            initPromise = import('parse-duration').then((mod) => {
                parseFn = extractFn(mod);
            });
        }
    }
    return initPromise;
};

module.exports = durationParser;
