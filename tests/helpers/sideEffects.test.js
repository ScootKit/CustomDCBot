const mainStub = require('../__stubs__/main');
const helpers = require('../../src/functions/helpers');

function resetClient() {
    mainStub.client.config = {
        disableEveryoneProtection: false,
        timezone: 'UTC'
    };
    mainStub.client.strings = {
        footer: 'test-footer',
        footerImgUrl: '',
        disableFooterTimestamp: false
    };
    mainStub.client.scnxSetup = false;
    mainStub.client.user = null;
    mainStub.client.guild = null;
    mainStub.client.modules = {};
    mainStub.client.logger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        log: jest.fn()
    };
    mainStub.client.logChannel = null;
    mainStub.client.models = {};
    mainStub.client.error = jest.fn();
}

beforeEach(resetClient);

describe('disableModule', () => {
    test('flips enabled to false and logs', () => {
        mainStub.client.modules.foo = {enabled: true};
        helpers.disableModule('foo', 'broken config');
        expect(mainStub.client.modules.foo.enabled).toBe(false);
        expect(mainStub.client.logger.error).toHaveBeenCalled();
    });

    test('throws when the module was never loaded', () => {
        expect(() => helpers.disableModule('missing')).toThrow(/never loaded/);
    });

    test('also sends to logChannel when present', () => {
        const send = jest.fn().mockResolvedValue();
        mainStub.client.modules.foo = {enabled: true};
        mainStub.client.logChannel = {send};
        helpers.disableModule('foo', 'reason');
        expect(send).toHaveBeenCalled();
    });
});

describe('migrate', () => {
    test('is a no-op when oldModel has no rows', async () => {
        const oldFindAll = jest.fn().mockResolvedValue([]);
        const newCreate = jest.fn();
        mainStub.client.models.m = {
            old: {findAll: oldFindAll},
            new: {create: newCreate}
        };
        await helpers.migrate('m', 'old', 'new');
        expect(oldFindAll).toHaveBeenCalled();
        expect(newCreate).not.toHaveBeenCalled();
    });

    test('copies each row to new model and destroys the source', async () => {
        const destroy1 = jest.fn().mockResolvedValue();
        const destroy2 = jest.fn().mockResolvedValue();
        const row1 = {
            dataValues: {
                id: 1,
                name: 'a',
                createdAt: 'x',
                updatedAt: 'y'
            },
            destroy: destroy1
        };
        const row2 = {
            dataValues: {
                id: 2,
                name: 'b'
            },
            destroy: destroy2
        };
        const newCreate = jest.fn().mockResolvedValue();
        mainStub.client.models.m = {
            old: {findAll: jest.fn().mockResolvedValue([row1, row2])},
            new: {create: newCreate}
        };
        await helpers.migrate('m', 'old', 'new');
        expect(newCreate).toHaveBeenCalledTimes(2);
        expect(newCreate).toHaveBeenCalledWith({
            id: 1,
            name: 'a'
        });
        expect(newCreate).toHaveBeenCalledWith({
            id: 2,
            name: 'b'
        });
        expect(destroy1).toHaveBeenCalled();
        expect(destroy2).toHaveBeenCalled();
    });
});

describe('tryArchiveDiscordAttachment', () => {
    test('returns null when client.scnxSetup is false', async () => {
        const result = await helpers.tryArchiveDiscordAttachment({scnxSetup: false}, 'https://x/img.png');
        expect(result).toBeNull();
    });
});

describe('archiveDiscordAttachment', () => {
    test('returns the original URL when scnxSetup is false', async () => {
        const url = 'https://cdn.discordapp.com/attachments/1/2/file.png';
        const result = await helpers.archiveDiscordAttachment({scnxSetup: false}, url);
        expect(result).toBe(url);
    });
});

/*
 * Tests below exercise paste-network paths and re-import helpers/centra per test.
 * Live in their own describe block so they can use jest.isolateModules without
 * disturbing the shared module instance used above.
 */
describe('messageLogToStringToPaste', () => {
    function mockCentraOk(jsonBody) {
        jest.doMock('centra', () => () => ({
            header: function () {
                return this;
            },
            body: function () {
                return this;
            },
            send: async () => ({
                statusCode: 200,
                headers: {},
                json: async () => jsonBody
            })
        }));
    }

    test('formats messages into a log block and uploads via paste', async () => {
        await jest.isolateModulesAsync(async () => {
            mockCentraOk({
                status: 0,
                id: 'abc123',
                url: '/?abc123'
            });
            const {messageLogToStringToPaste} = require('../../src/functions/helpers');
            const messages = [
                {
                    id: '1',
                    author: {
                        bot: false,
                        tag: 'Alice#0001',
                        username: 'Alice',
                        discriminator: '0001',
                        id: 'a-id'
                    },
                    content: 'first'
                },
                {
                    id: '2',
                    author: {
                        bot: true,
                        tag: 'Bot#0000',
                        username: 'Bot',
                        discriminator: '0000',
                        id: 'b-id'
                    },
                    content: 'second'
                }
            ];
            const channel = {
                id: 'ch-1',
                name: 'general',
                messages: {fetch: jest.fn().mockResolvedValue({forEach: (cb) => messages.forEach(cb)})}
            };
            const url = await messageLogToStringToPaste(channel, 50);
            expect(url).toMatch(/^https:\/\/paste\.scootkit\.com\/\?abc123#/);
            expect(channel.messages.fetch).toHaveBeenCalledWith({limit: 50});
        });
    });

    test('caps fetch limit at 100', async () => {
        await jest.isolateModulesAsync(async () => {
            mockCentraOk({
                status: 0,
                url: '/?x'
            });
            const {messageLogToStringToPaste} = require('../../src/functions/helpers');
            const channel = {
                id: 'c',
                name: 'n',
                messages: {
                    fetch: jest.fn().mockResolvedValue({
                        forEach: () => {
                        }
                    })
                }
            };
            await messageLogToStringToPaste(channel, 500);
            expect(channel.messages.fetch).toHaveBeenCalledWith({limit: 100});
        });
    });
});

describe('postToSCNetworkPaste end-to-end (mocked centra)', () => {
    test('returns full URL with base58 key fragment on success', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.doMock('centra', () => () => ({
                header: function () {
                    return this;
                },
                body: function () {
                    return this;
                },
                send: async () => ({
                    statusCode: 200,
                    headers: {},
                    json: async () => ({
                        status: 0,
                        url: '/?paste-id'
                    })
                })
            }));
            const {postToSCNetworkPaste} = require('../../src/functions/helpers');
            const url = await postToSCNetworkPaste('hello');
            expect(url).toMatch(/^https:\/\/paste\.scootkit\.com\/\?paste-id#[1-9A-HJ-NP-Za-km-z]+$/);
        });
    });

    test('throws PasteUploadError on permanent server rejection', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.doMock('centra', () => () => ({
                header: function () {
                    return this;
                },
                body: function () {
                    return this;
                },
                send: async () => ({
                    statusCode: 200,
                    headers: {},
                    json: async () => ({
                        status: 1,
                        message: 'Paste size invalid'
                    })
                })
            }));
            const {
                postToSCNetworkPaste,
                PasteUploadError
            } = require('../../src/functions/helpers');
            await expect(postToSCNetworkPaste('x')).rejects.toBeInstanceOf(PasteUploadError);
        });
    });

    test('throws PasteUploadError on persistent HTTP 4xx', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.doMock('centra', () => () => ({
                header: function () {
                    return this;
                },
                body: function () {
                    return this;
                },
                send: async () => ({
                    statusCode: 413,
                    headers: {},
                    json: async () => ({})
                })
            }));
            const {
                postToSCNetworkPaste,
                PasteUploadError
            } = require('../../src/functions/helpers');
            await expect(postToSCNetworkPaste('x')).rejects.toBeInstanceOf(PasteUploadError);
        });
    });
});