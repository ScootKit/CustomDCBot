// Tests for the configuration loader's stateful, fs/require-backed functions,
// exercised exclusively through the module's PUBLIC surface:
//   - loadAllConfigs(client)      -> drives checkConfigFile (builtIn) + checkModuleConfig
//   - reloadConfig(client)        -> drives loadAllConfigs + the scnx hooks
//
// checkConfigFile and checkModuleConfig are not exported, so they are reached
// indirectly: builtIn files via fs.readdir(config-generator), module files via
// each enabled module's module.json `config-example-files` list.
//
// checkType / isLocalizedObject / loadConfigLocalization are covered elsewhere
// (checkType.test.js, pure.test.js) and are NOT re-tested here.
//
// Strategy: configuration.js dynamically require()s its example config files by
// absolute path (`${__dirname}/../../config-generator/<file>` or the module
// equivalent), its module.json files, and `./scnx-integration`. We mock those
// via jest.doMock on the RESOLVED absolute paths, mock `jsonfile` and `fs`, and
// run each case inside jest.isolateModulesAsync so mocks are fresh and the
// module-load-time destructure of `logger`/`client` from the main stub picks up
// our per-test client.

const path = require('path');

// configuration.js destructures `logger`/`client` from the main stub at require
// time. Because each case runs inside an isolated module registry, the stub is
// configured there (see withConfig) rather than via a top-level reference.

const SRC_DIR = path.resolve(__dirname, '../../src/functions');
const ROOT = path.resolve(__dirname, '../..');

// Paths built EXACTLY as configuration.js builds them via string concatenation
// with its own __dirname (note the unnormalized `../..`). jest.doMock keys must
// match the require() request string, so we reproduce it verbatim here.
const generatorPath = (file) => `${SRC_DIR}/../../config-generator/${file}`;
const modulePath = (moduleName, file) => `${SRC_DIR}/../../modules/${moduleName}/${file}`;
// module.json is required relatively (`../../modules/<m>/module.json`) from
// configuration.js, which resolves to this absolute path.
const moduleJsonPath = (moduleName) => path.join(ROOT, 'modules', moduleName, 'module.json');
// Extensionless: scnx-integration.js ships only with the managed backend, so this is a VIRTUAL
// mock and jest keys it by the exact request string configuration.js uses (`./scnx-integration`).
const scnxPath = path.join(SRC_DIR, 'scnx-integration');

// Let the not-yet-awaited fs.readdir callback in loadAllConfigs drain its
// awaits (real checkType promises + sync jsonfile) before assertions run.
const flush = () => new Promise((r) => setImmediate(r));

function makeLogger() {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    };
}

function makeClient(over = {}) {
    const logger = makeLogger();
    return {
        logger,
        locale: 'en',
        configDir: '/cfg',
        scnxSetup: false,
        modules: {},
        configurations: {},
        intervals: [],
        jobs: [],
        config: {},
        emit: jest.fn(),
        ...over
    };
}

// Run `driver(cfg)` inside a freshly-isolated module registry with a configured
// main stub and mocked jsonfile/fs/scnx-integration + registered example files.
//
// The driver MUST run inside the isolation: configuration.js re-requires
// `../../main` at call time (`const {client} = require('../../main')`), and once
// isolateModulesAsync exits that require would resolve from the outer registry,
// returning a stub instance whose `.client` is not the one we configured.
//
// Returns { result, mocks } where mocks = {jsonfileMock, fsMock, scnxMock}.
async function withConfig({
    client,
    jsonfile = {},
    fs = {},
    scnx = {},
    mocks = [], // [{ path, content }] — virtual require()d modules
    driver
} = {}) {
    let out = {
        result: undefined,
        mocks: undefined
    };
    await jest.isolateModulesAsync(async () => {
        // Inside an isolated registry the ../../main stub is a *fresh* instance,
        // so configure that one (not the top-level reference) before requiring
        // configuration, which destructures logger/client from it at load time.
        const isolatedMain = require('../__stubs__/main');
        isolatedMain.client = client;
        isolatedMain.logger = client.logger;

        const jsonfileMock = {
            readFileSync: jest.fn(() => {
                throw new Error('ENOENT');
            }),
            writeFileSync: jest.fn(),
            ...jsonfile
        };
        const fsMock = {
            readdir: jest.fn((dir, cb) => cb(null, [])),
            existsSync: jest.fn().mockReturnValue(true),
            mkdirSync: jest.fn(),
            readFileSync: jest.fn(() => {
                throw new Error('no-loc-file');
            }),
            ...fs
        };
        const scnxMock = {
            reportIssue: jest.fn().mockResolvedValue(undefined),
            setFieldValue: jest.fn((c, f, v) => v),
            verifyLimitedConfigElementFile: jest.fn((c, e, d) => d),
            beforeInit: jest.fn().mockResolvedValue(undefined),
            init: jest.fn().mockResolvedValue(undefined),
            verifyCustomCommands: jest.fn().mockResolvedValue(undefined),
            ...scnx
        };

        jest.doMock('jsonfile', () => jsonfileMock);
        jest.doMock('fs', () => fsMock);
        jest.doMock(scnxPath, () => scnxMock, {virtual: true});

        for (const m of mocks) {
            // eslint-disable-next-line no-loop-func
            jest.doMock(m.path, () => m.content, {virtual: true});
        }

        const cfg = require('../../src/functions/configuration');
        out.mocks = {
            jsonfileMock,
            fsMock,
            scnxMock
        };
        if (driver) out.result = await driver(cfg);
        // Drain the not-yet-awaited fs.readdir callback in loadAllConfigs.
        await flush();
    });
    return out;
}

// Read back the single config object/array that was last written.
function lastWrite(mocks) {
    const calls = mocks.jsonfileMock.writeFileSync.mock.calls;
    return calls.length ? calls[calls.length - 1][1] : undefined;
}

afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
});


// ---------------------------------------------------------------------------
// checkConfigFile — driven through loadAllConfigs(client) with a single builtIn
// file returned by fs.readdir, and no enabled modules.
// ---------------------------------------------------------------------------

// Drive a single builtIn config file through loadAllConfigs and return
// {result, mocks, written} where `written` is the last writeFileSync payload.
async function runBuiltIn(client, file, example, opts = {}) {
    const {mocks} = await withConfig({
        client,
        jsonfile: opts.jsonfile,
        fs: {readdir: jest.fn((dir, cb) => cb(null, [file])), ...(opts.fs || {})},
        scnx: opts.scnx,
        mocks: [{
            path: generatorPath(file),
            content: example
        }, ...(opts.mocks || [])],
        driver: (cfg) => cfg.loadAllConfigs(client)
    });
    return {
        mocks,
        written: lastWrite(mocks)
    };
}

describe('checkConfigFile (builtIn) - plain object file', () => {
    test('creates the file (forceOverwrite) when read throws and writes resolved defaults', async () => {
        const client = makeClient();
        const example = {
            filename: 'demo.json',
            content: [
                {
                    name: 'a',
                    type: 'string',
                    default: 'hello'
                },
                {
                    name: 'b',
                    type: 'boolean',
                    default: true
                }
            ]
        };
        const {
            mocks,
            written
        } = await runBuiltIn(client, 'demo.json', example, {
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('ENOENT');
                })
            }
        });
        expect(mocks.jsonfileMock.writeFileSync).toHaveBeenCalled();
        expect(written).toEqual({
            a: 'hello',
            b: true
        });
        // "creating-file" info log emitted on the forceOverwrite path
        expect(client.logger.info).toHaveBeenCalledWith(expect.stringContaining('config.creating-file'));
    });

    test('does not rewrite when existing config already equals computed config', async () => {
        const client = makeClient();
        const example = {
            filename: 'demo.json',
            content: [{
                name: 'a',
                type: 'string',
                default: 'hello'
            }]
        };
        const {mocks} = await runBuiltIn(client, 'demo.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({a: 'hello'}))}
        });
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });

    test('uses the stored value over the default when present and valid', async () => {
        const client = makeClient();
        const example = {
            filename: 'demo.json',
            content: [
                {
                    name: 'a',
                    type: 'string',
                    default: 'def'
                },
                // a second field absent from the stored config forces a rewrite,
                // so the written payload can be inspected.
                {
                    name: 'b',
                    type: 'string',
                    default: 'fromDefault'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'demo.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({a: 'stored'}))}
        });
        // stored value kept for `a`; default filled in for the missing `b`
        expect(written).toEqual({
            a: 'stored',
            b: 'fromDefault'
        });
    });
});

describe('checkConfigFile (builtIn) - example file not found', () => {
    test('rejects (and loadAllConfigs reports the error) when example file cannot be required', async () => {
        const client = makeClient();
        // readdir returns a file we did NOT register, so require() throws.
        await withConfig({
            client,
            fs: {readdir: jest.fn((dir, cb) => cb(null, ['missing.json']))},
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('Not found config example file'));
    });
});

describe('checkConfigFile (builtIn) - configElements array file', () => {
    test('processes each element through its content fields', async () => {
        const client = makeClient();
        const example = {
            filename: 'list.json',
            configElements: true,
            // second field (absent from stored objects) forces a rewrite so the
            // written payload is observable.
            content: [
                {
                    name: 'label',
                    type: 'string',
                    default: 'x'
                },
                {
                    name: 'extra',
                    type: 'string',
                    default: 'E'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'list.json', example, {
            jsonfile: {readFileSync: jest.fn(() => [{label: 'one'}, {label: 'two'}])}
        });
        expect(written).toEqual([
            {
                label: 'one',
                extra: 'E'
            },
            {
                label: 'two',
                extra: 'E'
            }
        ]);
    });

    test('coerces a non-array existing file into a single-element array', async () => {
        const client = makeClient();
        const example = {
            filename: 'list.json',
            configElements: true,
            content: [
                {
                    name: 'label',
                    type: 'string',
                    default: 'd'
                },
                {
                    name: 'extra',
                    type: 'string',
                    default: 'E'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'list.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({label: 'solo'}))}
        });
        expect(client.logger.warn).toHaveBeenCalled();
        expect(written).toEqual([{
            label: 'solo',
            extra: 'E'
        }]);
    });

    test('a non-object existing file becomes an empty config-element array (no write when already empty)', async () => {
        const client = makeClient();
        const example = {
            filename: 'list.json',
            configElements: true,
            content: [{
                name: 'label',
                type: 'string',
                default: 'd'
            }]
        };
        // 'a-string' is neither array nor object -> configData becomes [], and the
        // computed config is also [] -> identical, so nothing is written.
        const {mocks} = await runBuiltIn(client, 'list.json', example, {
            jsonfile: {readFileSync: jest.fn(() => 'a-string')}
        });
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });

    // C1 regression guard: a channelID whose fetch REJECTS is indistinguishable from a
    // transient Discord blip, so the stored value must be KEPT (not healed+persisted to the
    // default). A second, plain field forces a write so we can prove `chan` kept 'bad-id'
    // rather than being overwritten with 'd'.
    test('a fetch-backed field whose fetch rejects keeps its stored value (not healed to default)', async () => {
        const client = makeClient({
            guildID: 'g1',
            channels: {fetch: jest.fn().mockRejectedValue(new Error('not found'))}
        });
        const example = {
            filename: 'els.json',
            configElements: true,
            content: [
                {
                    name: 'chan',
                    type: 'channelID',
                    default: 'd'
                },
                {
                    name: 'extra',
                    type: 'string',
                    default: 'E'
                }
            ]
        };
        const {mocks} = await runBuiltIn(client, 'els.json', example, {
            jsonfile: {readFileSync: jest.fn(() => [{chan: 'bad-id'}])}
        });
        // Kept the stored id verbatim; only the absent `extra` was defaulted.
        expect(lastWrite(mocks)).toEqual([{chan: 'bad-id', extra: 'E'}]);
        expect(client.logger.warn).toHaveBeenCalledWith(expect.stringContaining('keeping the stored value'));
        // The destructive heal-to-default log must NOT fire for a fetch-backed type.
        expect(client.logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('healed to default'));
    });
});

describe('checkConfigFile - keyed disableKeyEdits', () => {
    // The disableKeyEdits cleanup mutates the stored value in place, so the write
    // diff vanishes for builtIn files. Drive it through a module so the resolved
    // config is observable on client.configurations[module][file].
    test('drops unknown keys and back-fills missing keys from the default', async () => {
        const client = makeClient({
            modules: {
                km: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {km: {}}
        });
        const example = {
            filename: 'keyed.json',
            content: [
                {
                    name: 'map',
                    type: 'keyed',
                    disableKeyEdits: true,
                    content: {
                        key: 'string',
                        value: 'string'
                    },
                    default: {
                        a: 'A',
                        b: 'B'
                    }
                }
            ]
        };
        // stored has an extra key (c) to drop and is missing b to back-fill.
        await withConfig({
            client,
            jsonfile: {
                readFileSync: jest.fn(() => ({
                    map: {
                        a: 'kept',
                        c: 'remove'
                    }
                }))
            },
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            mocks: [
                {
                    path: moduleJsonPath('km'),
                    content: {'config-example-files': ['keyed.json']}
                },
                {
                    path: modulePath('km', 'keyed.json'),
                    content: example
                }
            ],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(client.configurations.km.keyed.map).toEqual({
            a: 'kept',
            b: 'B'
        });
    });
});

describe('checkConfigFile (builtIn) - skipContentCheck', () => {
    test('passes existing config through untouched (no rewrite when identical)', async () => {
        const client = makeClient();
        const existing = {
            anything: [1, 2, 3],
            nested: {x: true}
        };
        const example = {
            filename: 'raw.json',
            skipContentCheck: true,
            content: []
        };
        const {mocks} = await runBuiltIn(client, 'raw.json', example, {
            jsonfile: {readFileSync: jest.fn(() => existing)}
        });
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });
});

describe('checkConfigFile (builtIn) - dependsOn / dependsOnNot', () => {
    test('dependsOn=false short-circuits without type-checking the dependent field', async () => {
        const client = makeClient({
            // would be called if the channelID field were actually checked
            channels: {fetch: jest.fn().mockRejectedValue(new Error('should-not-be-called'))}
        });
        const example = {
            filename: 'dep.json',
            content: [
                {
                    name: 'enabled',
                    type: 'boolean',
                    default: false
                },
                {
                    name: 'channel',
                    type: 'channelID',
                    default: 'ignored',
                    dependsOn: 'enabled'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'dep.json', example, {
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('new');
                })
            }
        });
        expect(written.enabled).toBe(false);
        expect(written.channel).toBe('ignored');
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('dependsOn resolves transitively: a hidden ancestor short-circuits the whole chain', async () => {
        const client = makeClient({
            // rejects if the gated channelID field is ever type-checked
            channels: {fetch: jest.fn().mockRejectedValue(new Error('should-not-be-called'))}
        });
        const example = {
            filename: 'chain.json',
            content: [
                {name: 'master', type: 'boolean', default: false},
                {name: 'toggle', type: 'boolean', default: false, dependsOn: 'master'},
                {name: 'channel', type: 'channelID', default: 'ignored', dependsOn: 'toggle'},
                {name: 'extra', type: 'string', default: 'x'} // absent from input -> forces a write
            ]
        };
        // master OFF but the intermediate toggle holds a stale truthy value - the
        // gated channel field must still be treated as disabled (type check skipped).
        const {written} = await runBuiltIn(client, 'chain.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({master: false, toggle: true, channel: 'ignored'}))}
        });
        expect(written.channel).toBe('ignored');
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('configElements dependsOn resolves transitively through a stale-truthy intermediate', async () => {
        const client = makeClient();
        const example = {
            filename: 'chainel.json',
            configElements: true,
            content: [
                {name: 'master', type: 'boolean', default: false},
                {name: 'toggle', type: 'boolean', default: false, dependsOn: 'master'},
                {name: 'value', type: 'string', default: 'fallback', dependsOn: 'toggle'}
            ]
        };
        const {written} = await runBuiltIn(client, 'chainel.json', example, {
            jsonfile: {readFileSync: jest.fn(() => [{master: false, toggle: true, value: 'whatever'}])}
        });
        // master off -> chain unsatisfied -> the gated field is treated as disabled
        // (its incoming 'whatever' is NOT accepted; it resets to the default).
        expect(written[0].value).toBe('fallback');
    });

    test('rejects when dependsOn references a missing field', async () => {
        const client = makeClient();
        const example = {
            filename: 'baddep.json',
            content: [{
                name: 'x',
                type: 'string',
                default: 'v',
                dependsOn: 'nope'
            }]
        };
        const {mocks} = await runBuiltIn(client, 'baddep.json', example, {
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('new');
                })
            }
        });
        expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('Depends-On-Field nope'));
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });

    test('configElements dependsOnNot=true keeps the default for the gated field', async () => {
        const client = makeClient();
        const example = {
            filename: 'depnot.json',
            configElements: true,
            content: [
                {
                    name: 'disabled',
                    type: 'boolean',
                    default: true
                },
                {
                    name: 'value',
                    type: 'string',
                    default: 'kept',
                    dependsOnNot: 'disabled'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'depnot.json', example, {
            jsonfile: {
                readFileSync: jest.fn(() => [{
                    disabled: true,
                    value: 'whatever'
                }])
            }
        });
        expect(written[0].value).toBe('kept');
    });

    test('configElements dependsOn=false keeps the default for the gated field', async () => {
        const client = makeClient();
        const example = {
            filename: 'depel.json',
            configElements: true,
            content: [
                {
                    name: 'on',
                    type: 'boolean',
                    default: false
                },
                {
                    name: 'value',
                    type: 'string',
                    default: 'fallback',
                    dependsOn: 'on'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'depel.json', example, {
            jsonfile: {readFileSync: jest.fn(() => [{on: false}])}
        });
        expect(written[0].value).toBe('fallback');
    });
});

describe('checkConfigFile (builtIn) - elementToggle false branch', () => {
    test('when toggle is off, fields are copied/defaulted and overwrite is skipped', async () => {
        const client = makeClient();
        const example = {
            filename: 'toggle.json',
            content: [
                {
                    name: 'on',
                    type: 'boolean',
                    default: false,
                    elementToggle: true
                },
                {
                    name: 'inner',
                    type: 'string',
                    default: 'def'
                }
            ]
        };
        const {mocks} = await runBuiltIn(client, 'toggle.json', example, {
            jsonfile: {
                readFileSync: jest.fn(() => ({
                    on: false,
                    inner: 'stored'
                }))
            }
        });
        // skipOverwrite true (toggle off) and not forceOverwrite => no write
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });
});

describe('checkConfigFile (builtIn) - logChannelID special case', () => {
    test('swallows a SCHEMA-level rejection and sets null when file === "config"', async () => {
        const client = makeClient({guildID: 'g1'});
        // Value errors now heal inside checkField, so the logChannelID catch only fires for schema-level rejections; a field missing its default rejects at the schema level, exercising the preserved special case.
        const example = {
            filename: 'config.json',
            content: [{
                name: 'logChannelID',
                type: 'channelID'
            }]
        };
        // The readdir file name must be exactly 'config' for the special case.
        const {written} = await runBuiltIn(client, 'config', example, {
            jsonfile: {readFileSync: jest.fn(() => ({logChannelID: 'bad-id'}))}
        });
        expect(written.logChannelID).toBeNull();
    });

    test('a non-config file with a SCHEMA-level failure still rejects (no swallow)', async () => {
        const client = makeClient({guildID: 'g1'});
        // Missing default => schema-level reject, which (outside the logChannelID/config special case) still fails the whole file: logged, nothing written.
        const example = {
            filename: 'other.json',
            content: [{
                name: 'someChannel',
                type: 'channelID'
            }]
        };
        const {mocks} = await runBuiltIn(client, 'other.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({someChannel: 'bad-id'}))}
        });
        // loadAllConfigs swallows the rejection but logs it; nothing is written.
        expect(client.logger.error).toHaveBeenCalled();
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });
});

describe('checkConfigFile (builtIn) - allowNull and missing default', () => {
    test('allowNull non-boolean empty value is accepted as-is', async () => {
        const client = makeClient();
        const example = {
            filename: 'nul.json',
            content: [
                {
                    name: 'opt',
                    type: 'string',
                    default: 'd',
                    allowNull: true
                },
                // forces a rewrite (missing from the stored config) so the
                // allowNull passthrough for `opt` is observable in the payload.
                {
                    name: 'other',
                    type: 'string',
                    default: 'o'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'nul.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({opt: ''}))}
        });
        // empty string passed through untouched despite a non-empty default
        expect(written.opt).toBe('');
    });

    test('a field missing its default value causes a reject (logged, no write)', async () => {
        const client = makeClient();
        const example = {
            filename: 'nodef.json',
            content: [{
                name: 'x',
                type: 'string'
            }]
        };
        const {mocks} = await runBuiltIn(client, 'nodef.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({x: 'present'}))}
        });
        expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('Missing default value'));
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });
});

describe('checkConfigFile (builtIn) - localized default resolution', () => {
    test('legacy {en, de} default resolves to the client locale', async () => {
        const client = makeClient({locale: 'de'});
        const example = {
            filename: 'loc.json',
            content: [{
                name: 'greeting',
                type: 'string',
                default: {
                    en: 'Hello',
                    de: 'Hallo'
                }
            }]
        };
        const {written} = await runBuiltIn(client, 'loc.json', example, {
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('new');
                })
            }
        });
        expect(written.greeting).toBe('Hallo');
    });

    test('resolveDefault falls back to en for a localized elementToggle default when the locale is absent', async () => {
        // The elementToggle gate's default is resolved via resolveDefault (not
        // checkField), so a localized {en: ...} default with a locale that has no
        // entry exercises resolveDefault's isLocalizedObject + en-fallback branch.
        const client = makeClient({locale: 'fr'});
        const example = {
            filename: 'gate.json',
            content: [
                {
                    name: 'gate',
                    type: 'boolean',
                    default: {en: false},
                    elementToggle: true
                },
                {
                    name: 'inner',
                    type: 'string',
                    default: 'x'
                }
            ]
        };
        const {mocks} = await runBuiltIn(client, 'gate.json', example, {
            // stored config absent -> gate value comes from resolveDefault (en: false)
            jsonfile: {readFileSync: jest.fn(() => ({}))}
        });
        // gate resolved to the en fallback (false) -> toggle off -> overwrite skipped
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
    });

    test('external locale file supplies the default for a string field', async () => {
        const client = makeClient({locale: 'fr'});
        const example = {
            filename: 'loc.json',
            content: [{
                name: 'greeting',
                type: 'string',
                default: 'Hello'
            }]
        };
        const locFile = JSON.stringify({
            _core: {loc: {content: {greeting: {default: 'Bonjour'}}}}
        });
        const {written} = await runBuiltIn(client, 'loc.json', example, {
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('new');
                })
            },
            fs: {readFileSync: jest.fn(() => locFile)}
        });
        expect(written.greeting).toBe('Bonjour');
    });
});

// ---------------------------------------------------------------------------
// scnxSetup integration hooks inside checkField
// ---------------------------------------------------------------------------

describe('checkConfigFile (builtIn) - scnxSetup integration hooks', () => {
    test('wraps a passing field value through setFieldValue', async () => {
        const client = makeClient({scnxSetup: true});
        const example = {
            filename: 'config.json',
            content: [{
                name: 'greeting',
                type: 'string',
                default: 'hi'
            }]
        };
        const setFieldValue = jest.fn((c, f, v) => `wrapped:${v}`);
        const {written} = await runBuiltIn(client, 'config.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({greeting: 'hey'}))},
            scnx: {setFieldValue}
        });
        expect(setFieldValue).toHaveBeenCalled();
        expect(written.greeting).toBe('wrapped:hey');
    });

    // C1: a fetch-backed field that fails to verify (possibly a transient blip) must NOT
    // report a CONFIGURATION_ISSUE — that would spam the dashboard every boot for a value we
    // are deliberately keeping. The report is reserved for definitively-invalid non-fetch
    // values (see the select-field test below). Here the stored value is kept, not healed.
    test('a failing fetch-backed field does NOT report a CONFIGURATION_ISSUE and keeps its value', async () => {
        const client = makeClient({
            scnxSetup: true,
            guildID: 'g1',
            channels: {fetch: jest.fn().mockRejectedValue(new Error('x'))}
        });
        const example = {
            filename: 'config.json',
            content: [
                {
                    name: 'chan',
                    type: 'channelID',
                    default: 'fallback'
                },
                // absent field forces a write so the kept value is observable
                {
                    name: 'extra',
                    type: 'string',
                    default: 'E'
                }
            ]
        };
        const reportIssue = jest.fn().mockResolvedValue(undefined);
        const {written} = await runBuiltIn(client, 'config.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({chan: 'stored-id'}))},
            scnx: {reportIssue}
        });
        expect(reportIssue).not.toHaveBeenCalledWith(client, expect.objectContaining({type: 'CONFIGURATION_ISSUE'}));
        // stored id kept verbatim, never healed to 'fallback'
        expect(written.chan).toBe('stored-id');
    });
});

// Stronger defaults: invalid STORED VALUES heal to the field default instead of rejecting the whole file (which would disable the module).
describe('checkConfigFile - invalid stored values heal to the default', () => {
    // Real-world trigger: a select field whose schema evolved from boolean to a 3-way select; a legacy stored boolean `false` is no longer valid and must heal to the 'inherit' default rather than disabling the module.
    test('a select field with a legacy boolean stored value heals to the default and persists', async () => {
        const client = makeClient();
        const example = {
            filename: 'demo.json',
            content: [{
                name: 'mode',
                type: 'select',
                content: [{value: 'inherit'}, {value: 'on'}, {value: 'off'}],
                default: 'inherit'
            }]
        };
        const {written} = await runBuiltIn(client, 'demo.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({mode: false}))}
        });
        // Healed to the default...
        expect(written.mode).toBe('inherit');
        // ...and the warn log names the field, invalid value and the healed default.
        expect(client.logger.warn).toHaveBeenCalledWith(expect.stringContaining('healed to default'));
        // No hard error / whole-file rejection occurred.
        expect(client.logger.error).not.toHaveBeenCalled();
    });

    test('reports a CONFIGURATION_ISSUE (dashboard visibility) while still healing under scnxSetup', async () => {
        const client = makeClient({scnxSetup: true});
        const example = {
            filename: 'demo.json',
            content: [{
                name: 'mode',
                type: 'select',
                content: [{value: 'inherit'}, {value: 'on'}, {value: 'off'}],
                default: 'inherit'
            }]
        };
        const {
            mocks,
            written
        } = await runBuiltIn(client, 'demo.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({mode: false}))}
        });
        expect(mocks.scnxMock.reportIssue).toHaveBeenCalledWith(client, expect.objectContaining({
            type: 'CONFIGURATION_ISSUE',
            field: 'mode',
            errorDescription: 'field_check_failed'
        }));
        expect(written.mode).toBe('inherit');
    });

    test('a SCHEMA-level failure inside a config element still rejects the file', async () => {
        const client = makeClient();
        // Missing default is a schema error (not a value error), so it is NOT healed: checkField rejects and the configElements loop propagates the rejection.
        const example = {
            filename: 'els.json',
            configElements: true,
            content: [{
                name: 'x',
                type: 'string'
            }]
        };
        await runBuiltIn(client, 'els.json', example, {
            jsonfile: {readFileSync: jest.fn(() => [{x: 'present'}])}
        });
        expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('Missing default value'));
    });

    test('a healed flat-config value lands in newConfig and is persisted', async () => {
        const client = makeClient();
        // integer field with a stored non-numeric string heals to the numeric default.
        const example = {
            filename: 'demo.json',
            content: [{
                name: 'count',
                type: 'integer',
                default: 5
            }]
        };
        const {
            mocks,
            written
        } = await runBuiltIn(client, 'demo.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({count: 'not-a-number'}))}
        });
        expect(mocks.jsonfileMock.writeFileSync).toHaveBeenCalled();
        expect(written).toEqual({count: 5});
    });

    test('heals an invalid value in a MODULE config (warn names the module) and the module stays loaded', async () => {
        const client = makeClient({
            modules: {
                mymod: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {mymod: {}}
        });
        const example = {
            filename: 'settings.json',
            content: [{
                name: 'count',
                type: 'integer',
                default: 5
            }]
        };
        await withConfig({
            client,
            jsonfile: {readFileSync: jest.fn(() => ({count: 'not-a-number'}))},
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            mocks: [
                {
                    path: moduleJsonPath('mymod'),
                    content: {'config-example-files': ['settings.json']}
                },
                {
                    path: modulePath('mymod', 'settings.json'),
                    content: example
                }
            ],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        // Module not disabled by a whole-file rejection; healed value materialized.
        expect(client.modules.mymod.enabled).toBe(true);
        expect(client.configurations.mymod.settings).toEqual({count: 5});
        expect(client.logger.warn).toHaveBeenCalledWith(expect.stringContaining('module mymod'));
    });

    // C1: a whole ARRAY of fetch-backed ids must not be emptied to the default when one element
    // fails to fetch (a transient blip on a single role should never wipe the list).
    test('an array of fetch-backed ids keeps its stored value when an element fails to fetch', async () => {
        const client = makeClient({
            guildID: 'g1',
            guilds: {fetch: jest.fn().mockResolvedValue({roles: {fetch: jest.fn().mockResolvedValue(null)}})}
        });
        const example = {
            filename: 'demo.json',
            content: [
                {
                    name: 'roles',
                    type: 'array',
                    content: 'roleID',
                    default: []
                },
                {
                    name: 'extra',
                    type: 'string',
                    default: 'E'
                }
            ]
        };
        const {written} = await runBuiltIn(client, 'demo.json', example, {
            jsonfile: {readFileSync: jest.fn(() => ({roles: ['r1', 'r2']}))}
        });
        // Array kept verbatim, NOT emptied to [].
        expect(written.roles).toEqual(['r1', 'r2']);
        expect(client.logger.warn).toHaveBeenCalledWith(expect.stringContaining('keeping the stored value'));
    });

    // M3: a REQUIRED (non-allowNull) fetch-backed field with an empty-string default that is left
    // unconfigured must NOT heal-to-'' every boot (issue spam + enabled-but-broken). It routes to
    // the reject-to-disable path: the module is disabled and a single MODULE_FAILURE is reported,
    // with NO per-boot CONFIGURATION_ISSUE.
    test('a required empty-default fetch-backed field disables the module instead of heal-thrashing', async () => {
        const client = makeClient({
            scnxSetup: true,
            guildID: 'g1',
            channels: {fetch: jest.fn().mockRejectedValue(new Error('unconfigured'))},
            modules: {
                mod: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {mod: {}}
        });
        const reportIssue = jest.fn().mockResolvedValue(undefined);
        await withConfig({
            client,
            jsonfile: {readFileSync: jest.fn(() => ({logchannel: ''}))},
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            scnx: {reportIssue},
            mocks: [
                {
                    path: moduleJsonPath('mod'),
                    content: {'config-example-files': ['config.json']}
                },
                {
                    path: modulePath('mod', 'config.json'),
                    content: {
                        filename: 'config.json',
                        content: [{
                            name: 'logchannel',
                            type: 'channelID',
                            default: ''
                        }]
                    }
                }
            ],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        // Reject-to-disable path taken: module disabled, single MODULE_FAILURE, no CONFIGURATION_ISSUE spam.
        expect(client.modules.mod.enabled).toBe(false);
        expect(reportIssue).toHaveBeenCalledWith(client, expect.objectContaining({type: 'MODULE_FAILURE'}));
        expect(reportIssue).not.toHaveBeenCalledWith(client, expect.objectContaining({type: 'CONFIGURATION_ISSUE'}));
    });
});

// ---------------------------------------------------------------------------
// checkConfigFile (module path) — driven through loadAllConfigs' module loop.
// ---------------------------------------------------------------------------

describe('checkConfigFile (module) - non-builtIn path', () => {
    test('writes into configurations[moduleName] and creates the module dir when missing', async () => {
        const client = makeClient({
            modules: {
                mymod: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {mymod: {}}
        });
        const example = {
            filename: 'settings.json',
            content: [{
                name: 'foo',
                type: 'string',
                default: 'bar'
            }]
        };
        const {mocks} = await withConfig({
            client,
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('new');
                })
            },
            fs: {
                readdir: jest.fn((dir, cb) => cb(null, [])),
                existsSync: jest.fn().mockReturnValue(false)
            },
            mocks: [
                {
                    path: moduleJsonPath('mymod'),
                    content: {'config-example-files': ['settings.json']}
                },
                {
                    path: modulePath('mymod', 'settings.json'),
                    content: example
                }
            ],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(mocks.fsMock.mkdirSync).toHaveBeenCalledWith('/cfg/mymod');
        expect(client.configurations.mymod.settings).toEqual({foo: 'bar'});
    });
});

// ---------------------------------------------------------------------------
// loadAllConfigs
// ---------------------------------------------------------------------------

describe('loadAllConfigs', () => {
    test('checks generator files + enabled modules and returns the summary shape', async () => {
        const client = makeClient({
            modules: {
                modA: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                },
                modB: {
                    userEnabled: false,
                    enabled: false,
                    config: {}
                }
            },
            configurations: {modA: {}}
        });
        const genExample = {
            filename: 'g.json',
            content: [{
                name: 'k',
                type: 'string',
                default: 'v'
            }]
        };
        const modExample = {
            filename: 'm.json',
            content: [{
                name: 'mk',
                type: 'string',
                default: 'mv'
            }]
        };

        const {result: data} = await withConfig({
            client,
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('new');
                })
            },
            fs: {readdir: jest.fn((dir, cb) => cb(null, ['g.json']))},
            mocks: [
                {
                    path: generatorPath('g.json'),
                    content: genExample
                },
                {
                    path: moduleJsonPath('modA'),
                    content: {'config-example-files': ['m.json']}
                },
                {
                    path: modulePath('modA', 'm.json'),
                    content: modExample
                }
            ],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(data).toEqual({
            totalModules: 2,
            enabled: 1,
            configDisabled: 0,
            userEnabled: 0
        });
        expect(client.configurations.modA.m).toEqual({mk: 'mv'});
    });

    test('skips disabled modules (userEnabled false)', async () => {
        const client = makeClient({
            modules: {
                off: {
                    userEnabled: false,
                    enabled: false,
                    config: {}
                }
            },
            configurations: {off: {}}
        });
        const {result: data} = await withConfig({
            client,
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(data.totalModules).toBe(1);
        // module.json never required because the module was skipped
        expect(client.configurations.off).toEqual({});
    });

    test('disables a module internally and reports an issue when its config check fails under scnxSetup', async () => {
        const client = makeClient({
            scnxSetup: true,
            modules: {
                broken: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {broken: {}}
        });
        const reportIssue = jest.fn().mockResolvedValue(undefined);
        await withConfig({
            client,
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            scnx: {reportIssue},
            mocks: [{
                path: moduleJsonPath('broken'),
                content: {'config-example-files': ['missing.json']}
            }],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(client.modules.broken.enabled).toBe(false);
        expect(client.logger.error).toHaveBeenCalled();
        expect(reportIssue).toHaveBeenCalledWith(client, expect.objectContaining({type: 'MODULE_FAILURE'}));
    });

    // Covers configuration.js:107 (the `intentDisabled.has(moduleName)` skip) together with
    // the applyIntentDisables scnxSetup report branch (configuration.js:73). A module whose
    // module.json declares a REQUIRED privileged intent that config.json's allowlist excludes
    // must be disabled + reported EXACTLY ONCE by applyIntentDisables, and loadAllConfigs must
    // `continue` past it rather than also running its own (here: guaranteed-to-fail) config
    // check - proven by asserting reportIssue was only invoked once and logger.error (which the
    // config-check failure path would also trigger) was never called.
    test('skips the module-level config check for a module already disabled by the privileged-intent allowlist', async () => {
        const client = makeClient({
            scnxSetup: true,
            modules: {
                presencemod: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {presencemod: {}}
        });
        const reportIssue = jest.fn().mockResolvedValue(undefined);
        const moduleJsonRealPath = path.join(ROOT, 'modules', 'presencemod', 'module.json');
        await withConfig({
            client,
            jsonfile: {
                readFileSync: jest.fn((p) => {
                    if (p === '/cfg/modules.json') return {presencemod: true};
                    if (p === '/cfg/config.json') return {allowedPrivilegedIntents: ['GuildMembers']};
                    if (p === moduleJsonRealPath) return {intents: ['GuildPresences']};
                    throw new Error('ENOENT');
                })
            },
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            scnx: {reportIssue},
            mocks: [{
                // Real `require()`-based module.json used by checkModuleConfig. Declares a
                // config-example-file that is NOT mocked, so if checkModuleConfig were (wrongly)
                // reached for this module, checkConfigFile would reject and loadAllConfigs would
                // report a SECOND (different) MODULE_FAILURE and log an error.
                path: moduleJsonPath('presencemod'),
                content: {'config-example-files': ['settings.json']}
            }],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(client.modules.presencemod.enabled).toBe(false);
        expect(client.modules.presencemod.userEnabled).toBe(true);
        expect(reportIssue).toHaveBeenCalledTimes(1);
        expect(reportIssue).toHaveBeenCalledWith(client, expect.objectContaining({
            type: 'MODULE_FAILURE',
            errorDescription: 'module_disabled',
            module: 'presencemod',
            errorData: expect.objectContaining({reason: expect.stringContaining('GuildPresences')})
        }));
        // The module-level config-check catch path (which also disables + reports + logs.error)
        // never ran, proving the intentDisabled `continue` skip fired.
        expect(client.logger.error).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// checkModuleConfig (reached via loadAllConfigs, asserted on its effects)
// ---------------------------------------------------------------------------

describe('checkModuleConfig', () => {
    test('a module with no config-example-files contributes no configuration writes', async () => {
        const client = makeClient({
            modules: {
                empty: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {empty: {}}
        });
        const {mocks} = await withConfig({
            client,
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            mocks: [{
                path: moduleJsonPath('empty'),
                content: {'config-example-files': []}
            }],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(mocks.jsonfileMock.writeFileSync).not.toHaveBeenCalled();
        expect(client.configurations.empty).toEqual({});
    });

    test('checks each configured example file for the module', async () => {
        const client = makeClient({
            modules: {
                mod: {
                    userEnabled: true,
                    enabled: true,
                    config: {}
                }
            },
            configurations: {mod: {}}
        });
        const example = {
            filename: 's.json',
            content: [{
                name: 'x',
                type: 'string',
                default: 'y'
            }]
        };
        await withConfig({
            client,
            jsonfile: {
                readFileSync: jest.fn(() => {
                    throw new Error('new');
                })
            },
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            mocks: [
                {
                    path: moduleJsonPath('mod'),
                    content: {'config-example-files': ['s.json']}
                },
                {
                    path: modulePath('mod', 's.json'),
                    content: example
                }
            ],
            driver: (cfg) => cfg.loadAllConfigs(client)
        });
        expect(client.configurations.mod.s).toEqual({x: 'y'});
    });
});

// ---------------------------------------------------------------------------
// reloadConfig
// ---------------------------------------------------------------------------

describe('reloadConfig', () => {
    test('clears intervals/jobs, emits events, reapplies modules.json and returns the summary', async () => {
        const cancel = jest.fn();
        const client = makeClient({
            intervals: ['iv'],
            jobs: [{cancel}, null],
            modules: {
                m1: {
                    userEnabled: false,
                    enabled: false,
                    config: {}
                }
            },
            configurations: {m1: {}}
        });

        const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {
        });
        const {result: res} = await withConfig({
            client,
            jsonfile: {
                readFileSync: jest.fn((p) => {
                    if (p.endsWith('modules.json')) return {m1: true};
                    throw new Error('new');
                })
            },
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            mocks: [{
                path: moduleJsonPath('m1'),
                content: {'config-example-files': []}
            }],
            driver: (cfg) => cfg.reloadConfig(client)
        });
        clearIntervalSpy.mockRestore();

        expect(client.emit).toHaveBeenCalledWith('configReload');
        expect(client.emit).toHaveBeenCalledWith('botReady');
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(client.intervals).toEqual([]);
        expect(client.jobs).toEqual([]);
        expect(client.modules.m1.enabled).toBe(true);
        expect(client.modules.m1.userEnabled).toBe(true);
        expect(client.botReadyAt).toBeInstanceOf(Date);
        expect(res).toHaveProperty('totalModules', 1);
    });

    test('runs the scnx hooks and reloads custom commands when scnxSetup is true', async () => {
        const client = makeClient({
            scnxSetup: true,
            modules: {},
            configurations: {}
        });
        const beforeInit = jest.fn().mockResolvedValue(undefined);
        const init = jest.fn().mockResolvedValue(undefined);
        const verifyCustomCommands = jest.fn().mockResolvedValue(undefined);
        await withConfig({
            client,
            jsonfile: {
                readFileSync: jest.fn((p) => {
                    if (p.endsWith('modules.json')) return {};
                    if (p.endsWith('custom-commands.json')) return [{name: 'cc'}];
                    throw new Error('new');
                })
            },
            fs: {readdir: jest.fn((dir, cb) => cb(null, []))},
            scnx: {
                beforeInit,
                init,
                verifyCustomCommands
            },
            driver: (cfg) => cfg.reloadConfig(client)
        });
        expect(beforeInit).toHaveBeenCalledWith(client);
        expect(init).toHaveBeenCalledWith(client, true);
        expect(verifyCustomCommands).toHaveBeenCalledWith(client);
        expect(client.config.customCommands).toEqual([{name: 'cc'}]);
    });
});