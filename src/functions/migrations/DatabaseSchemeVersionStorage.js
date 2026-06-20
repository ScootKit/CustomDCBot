/**
 * Umzug Storage adapter that uses the existing `system_DatabaseSchemeVersion` table.
 *
 * Migration files follow the naming convention `<moduleTablePrefix>_<Model>__V<n>`,
 * e.g. `levels_User__V1`. The double-underscore separates the legacy `model` value
 * from the version.
 *
 * Two row formats are supported simultaneously so existing installations keep working:
 *
 *   - Legacy:  { model: 'levels_User',     version: 'V2' }   (one row per model, latest version only)
 *   - New:     { model: 'levels_User__V2', version: 'applied' }   (one row per executed migration)
 *
 * On read, a legacy row with version `V2` expands to all migration names from V1..V2
 * for that model, so a customer who is at V2 via the old code path is treated as having
 * applied both V1 and V2 in the new framework.
 *
 * On write, we always insert new-format rows. Legacy rows are left untouched, so a
 * downgrade or rollback to the old code path would still see the latest-known version.
 */

const PREFIX_SUFFIX_SEPARATOR = '__';

function parseMigrationName(name) {
    const idx = name.lastIndexOf(PREFIX_SUFFIX_SEPARATOR);
    if (idx === -1) return null;
    const model = name.slice(0, idx);
    const version = name.slice(idx + PREFIX_SUFFIX_SEPARATOR.length);
    return {
        model,
        version
    };
}

function versionNumber(version) {
    const match = (/^V(?<num>\d+)$/).exec(version);
    if (!match) return null;
    return parseInt(match.groups.num, 10);
}

class DatabaseSchemeVersionStorage {
    constructor({getModel}) {
        this.getModel = getModel;
    }

    async logMigration({name}) {
        await this.getModel().upsert({
            model: name,
            version: 'applied'
        });
    }

    async unlogMigration({name}) {
        await this.getModel().destroy({where: {model: name}});
        const parsed = parseMigrationName(name);
        if (parsed) {
            await this.getModel().destroy({
                where: {
                    model: parsed.model,
                    version: parsed.version
                }
            });
        }
    }

    async executed() {
        const rows = await this.getModel().findAll();
        const names = new Set();

        for (const row of rows) {
            if (row.model.includes(PREFIX_SUFFIX_SEPARATOR)) {
                names.add(row.model);
                continue;
            }

            const num = versionNumber(row.version || '');
            if (num !== null) {
                for (let i = 1; i <= num; i++) names.add(`${row.model}${PREFIX_SUFFIX_SEPARATOR}V${i}`);
            } else if (row.version) {
                names.add(`${row.model}${PREFIX_SUFFIX_SEPARATOR}${row.version}`);
            }
        }

        return Array.from(names);
    }
}

module.exports = DatabaseSchemeVersionStorage;
module.exports.parseMigrationName = parseMigrationName;
module.exports.versionNumber = versionNumber;