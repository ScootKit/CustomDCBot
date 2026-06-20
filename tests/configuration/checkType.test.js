// Tests for configuration.checkType — the per-field type validator.
//
// checkType is async and reads the live client via require('../../main') for
// the ID-resolving branches (userID/channelID/roleID/guildID). The main stub
// is mutated in setup so those branches can be driven deterministically.
// process.exit is stubbed so the "unknown type" default branch can be asserted
// without killing the test runner.

const {ChannelType} = require('discord.js');
// configuration.js destructures `logger` from the main stub at require time,
// so the stub must expose a logger BEFORE configuration is first required.
const main = require('../__stubs__/main');
main.logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};
main.client.logger = main.logger;
const {checkType} = require('../../src/functions/configuration');

const baseClient = main.client;

afterEach(() => {
    jest.restoreAllMocks();
});

describe('checkType - integer', () => {
    test('zero is always valid (short-circuit)', async () => {
        await expect(checkType({type: 'integer'}, 0)).resolves.toBe(true);
        await expect(checkType({type: 'integer'}, '0')).resolves.toBe(true);
    });

    test('valid positive integer', async () => {
        await expect(checkType({type: 'integer'}, 42)).resolves.toBe(true);
        await expect(checkType({type: 'integer'}, '42')).resolves.toBe(true);
    });

    test('non-numeric string is invalid', async () => {
        await expect(checkType({type: 'integer'}, 'abc')).resolves.toBe(false);
    });

    test('rejects above maxValue', async () => {
        await expect(checkType({
            type: 'integer',
            maxValue: 10
        }, 11)).resolves.toBe(false);
        await expect(checkType({
            type: 'integer',
            maxValue: 10
        }, 10)).resolves.toBe(true);
    });

    test('rejects below minValue', async () => {
        await expect(checkType({
            type: 'integer',
            minValue: 5
        }, 4)).resolves.toBe(false);
        await expect(checkType({
            type: 'integer',
            minValue: 5
        }, 5)).resolves.toBe(true);
    });

    test('within min/max range is valid', async () => {
        await expect(checkType({
            type: 'integer',
            minValue: 1,
            maxValue: 10
        }, 5)).resolves.toBe(true);
    });
});

describe('checkType - float', () => {
    test('zero is valid', async () => {
        await expect(checkType({type: 'float'}, 0)).resolves.toBe(true);
        await expect(checkType({type: 'float'}, '0.0')).resolves.toBe(true);
    });

    test('valid float', async () => {
        await expect(checkType({type: 'float'}, 1.5)).resolves.toBe(true);
    });

    test('non-numeric is invalid', async () => {
        await expect(checkType({type: 'float'}, 'x')).resolves.toBe(false);
    });

    test('respects maxValue and minValue', async () => {
        await expect(checkType({
            type: 'float',
            maxValue: 2.5
        }, 2.6)).resolves.toBe(false);
        await expect(checkType({
            type: 'float',
            minValue: 1.0
        }, 0.5)).resolves.toBe(false);
        await expect(checkType({
            type: 'float',
            minValue: 1.0,
            maxValue: 2.0
        }, 1.5)).resolves.toBe(true);
    });
});

describe('checkType - string-like types', () => {
    test.each(['string', 'emoji', 'imgURL', 'timezone'])('%s accepts strings', async (type) => {
        await expect(checkType({type}, 'hello')).resolves.toBe(true);
    });

    test.each(['string', 'emoji', 'imgURL', 'timezone'])('%s rejects non-strings', async (type) => {
        await expect(checkType({type}, 123)).resolves.toBe(false);
        await expect(checkType({type}, {})).resolves.toBe(false);
    });

    test('allowEmbed permits object values', async () => {
        await expect(checkType({
            type: 'string',
            allowEmbed: true
        }, {embed: true})).resolves.toBe(true);
    });

    test('allowEmbed still accepts plain strings', async () => {
        await expect(checkType({
            type: 'string',
            allowEmbed: true
        }, 'text')).resolves.toBe(true);
    });
});

describe('checkType - boolean', () => {
    test('true / false are valid', async () => {
        await expect(checkType({type: 'boolean'}, true)).resolves.toBe(true);
        await expect(checkType({type: 'boolean'}, false)).resolves.toBe(true);
    });

    test('truthy non-boolean is invalid', async () => {
        await expect(checkType({type: 'boolean'}, 'true')).resolves.toBe(false);
        await expect(checkType({type: 'boolean'}, 1)).resolves.toBe(false);
    });
});

describe('checkType - array', () => {
    test('rejects non-arrays', async () => {
        await expect(checkType({
            type: 'array',
            content: 'string'
        }, 'not array')).resolves.toBe(false);
    });

    test('empty array is valid', async () => {
        await expect(checkType({
            type: 'array',
            content: 'string'
        }, [])).resolves.toBe(true);
    });

    test('array of valid element types', async () => {
        await expect(checkType({
            type: 'array',
            content: 'string'
        }, ['a', 'b'])).resolves.toBe(true);
    });

    test('array with a bad element is invalid', async () => {
        await expect(checkType({
            type: 'array',
            content: 'string'
        }, ['a', 5])).resolves.toBe(false);
    });

    test('array of integers', async () => {
        await expect(checkType({
            type: 'array',
            content: 'integer'
        }, [1, 2, 3])).resolves.toBe(true);
        await expect(checkType({
            type: 'array',
            content: 'integer'
        }, [1, 'x'])).resolves.toBe(false);
    });
});

describe('checkType - keyed', () => {
    test('rejects non-objects', async () => {
        await expect(checkType({
            type: 'keyed',
            content: {
                key: 'string',
                value: 'string'
            }
        }, 'str')).resolves.toBe(false);
    });

    test('valid string->string map', async () => {
        await expect(checkType({
            type: 'keyed',
            content: {
                key: 'string',
                value: 'string'
            }
        }, {a: 'b'})).resolves.toBe(true);
    });

    test('string->integer map with bad value', async () => {
        await expect(checkType({
            type: 'keyed',
            content: {
                key: 'string',
                value: 'integer'
            }
        }, {a: 'notnum'})).resolves.toBe(false);
    });

    test('empty object is valid', async () => {
        await expect(checkType({
            type: 'keyed',
            content: {
                key: 'string',
                value: 'string'
            }
        }, {})).resolves.toBe(true);
    });
});

describe('checkType - select', () => {
    test('string list: value must be included', async () => {
        await expect(checkType({
            type: 'select',
            content: ['a', 'b', 'c']
        }, 'b')).resolves.toBe(true);
        await expect(checkType({
            type: 'select',
            content: ['a', 'b']
        }, 'z')).resolves.toBe(false);
    });

    test('object list: matches by .value', async () => {
        const content = [{
            value: 'x',
            label: 'X'
        }, {
            value: 'y',
            label: 'Y'
        }];
        await expect(checkType({
            type: 'select',
            content
        }, 'x')).resolves.toBeTruthy();
        await expect(checkType({
            type: 'select',
            content
        }, 'nope')).resolves.toBeFalsy();
    });
});

describe('checkType - userID', () => {
    test('valid when user resolves', async () => {
        baseClient.users = {fetch: jest.fn().mockResolvedValue({id: '1'})};
        await expect(checkType({type: 'userID'}, '1')).resolves.toBe(true);
    });

    test('invalid when fetch rejects', async () => {
        baseClient.users = {fetch: jest.fn().mockRejectedValue(new Error('nope'))};
        await expect(checkType({type: 'userID'}, 'bad')).resolves.toBe(false);
    });
});

describe('checkType - channelID', () => {
    beforeEach(() => {
        baseClient.guildID = 'guild-1';
    });

    test('valid text channel on the right guild', async () => {
        baseClient.channels = {
            fetch: jest.fn().mockResolvedValue({
                guild: {id: 'guild-1'},
                type: ChannelType.GuildText
            })
        };
        await expect(checkType({type: 'channelID'}, 'c1')).resolves.toBe(true);
    });

    test('invalid when channel not found', async () => {
        baseClient.channels = {fetch: jest.fn().mockRejectedValue(new Error('x'))};
        await expect(checkType({type: 'channelID'}, 'c1')).resolves.toBe(false);
    });

    test('invalid when channel on a different guild', async () => {
        baseClient.channels = {
            fetch: jest.fn().mockResolvedValue({
                guild: {id: 'other-guild'},
                type: ChannelType.GuildText
            })
        };
        await expect(checkType({type: 'channelID'}, 'c1')).resolves.toBe(false);
    });

    test('invalid when channel type not in allowed list', async () => {
        baseClient.channels = {
            fetch: jest.fn().mockResolvedValue({
                guild: {id: 'guild-1'},
                type: ChannelType.GuildVoice
            })
        };
        // field.content restricts to text channels via the string alias
        await expect(checkType({
            type: 'channelID',
            content: ['GUILD_TEXT']
        }, 'c1')).resolves.toBe(false);
    });

    test('maps string channel-type aliases to discord enum', async () => {
        baseClient.channels = {
            fetch: jest.fn().mockResolvedValue({
                guild: {id: 'guild-1'},
                type: ChannelType.GuildForum
            })
        };
        await expect(checkType({
            type: 'channelID',
            content: ['GUILD_FORUM']
        }, 'c1')).resolves.toBe(true);
    });
});

describe('checkType - roleID', () => {
    test('valid when role resolves', async () => {
        baseClient.guildID = 'g1';
        baseClient.guilds = {
            fetch: jest.fn().mockResolvedValue({
                roles: {fetch: jest.fn().mockResolvedValue({id: 'r1'})}
            })
        };
        await expect(checkType({type: 'roleID'}, 'r1')).resolves.toBe(true);
    });

    test('invalid when role missing', async () => {
        baseClient.guildID = 'g1';
        baseClient.guilds = {
            fetch: jest.fn().mockResolvedValue({
                roles: {fetch: jest.fn().mockResolvedValue(null)}
            })
        };
        await expect(checkType({type: 'roleID'}, 'r1')).resolves.toBeFalsy();
    });
});

describe('checkType - guildID', () => {
    test('valid when guild is in cache', async () => {
        baseClient.guildID = 'g1';
        baseClient.guilds = {cache: {find: (fn) => fn({id: 'g1'}) ? {id: 'g1'} : undefined}};
        await expect(checkType({type: 'guildID'}, 'g1')).resolves.toBe(true);
    });

    test('invalid when guild not in cache', async () => {
        baseClient.guildID = 'g1';
        baseClient.guilds = {cache: {find: () => undefined}};
        await expect(checkType({type: 'guildID'}, 'g1')).resolves.toBe(false);
    });
});

describe('checkType - unknown type', () => {
    test('logs and calls process.exit(0)', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
        await checkType({type: 'totally-unknown'}, 'x');
        expect(exitSpy).toHaveBeenCalledWith(0);
    });
});