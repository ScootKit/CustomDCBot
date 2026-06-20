// Deterministic localize stub: returns "<namespace>.<key>" plus a stable
// representation of the args, so tests can assert on the formatting layer
// without depending on the actual locale files.
module.exports = {
    localize: (namespace, key, args = {}) => {
        const keys = Object.keys(args);
        if (keys.length === 0) return `${namespace}.${key}`;
        const argString = keys.sort().map((k) => `${k}=${args[k]}`).join(',');
        return `${namespace}.${key}(${argString})`;
    }
};
