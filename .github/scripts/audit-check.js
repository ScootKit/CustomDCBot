/*
 * Fails when `npm audit` (production dependencies, lockfile only) reports a HIGH/CRITICAL advisory that is not
 * listed in .github/audit-ignore.json. Run from the package directory:
 *   node <repo>/.github/scripts/audit-check.js <path-to-audit-ignore.json>
 * Add an advisory id (GHSA-...) to the ignore file ONLY when no patched version exists, and say why in the commit.
 */
const {execSync} = require('child_process');
const fs = require('fs');

const ignoreFile = process.argv[2];
const ignored = new Set(ignoreFile && fs.existsSync(ignoreFile) ? JSON.parse(fs.readFileSync(ignoreFile, 'utf8')) : []);

let out;
try {
    out = execSync('npm audit --package-lock-only --omit=dev --json', {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
} catch (e) {
    out = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(out);
if (report.error) {
    console.error('npm audit failed:', report.error.summary || JSON.stringify(report.error));
    process.exit(2);
}

const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities || {})) {
    for (const via of vuln.via) {
        if (typeof via !== 'object') continue; // string = transitive of another package
        const id = (via.url || '').split('/').pop();
        advisories.set(id || `${via.name}:${via.title}`, {id, name: via.name, severity: via.severity, title: via.title, range: via.range});
    }
}
const bad = [...advisories.values()].filter((a) => ['high', 'critical'].includes(a.severity) && !ignored.has(a.id));
const skipped = [...advisories.values()].filter((a) => ['high', 'critical'].includes(a.severity) && ignored.has(a.id));
for (const a of skipped) console.log(`ignored (no fix available): ${a.id} ${a.name} - ${a.title}`);
if (bad.length) {
    for (const a of bad) console.error(`::error::${a.severity.toUpperCase()} ${a.id} ${a.name} ${a.range} - ${a.title}`);
    process.exit(1);
}
console.log(`ok: no unignored high/critical advisories in production dependencies (${advisories.size} total advisories)`);
