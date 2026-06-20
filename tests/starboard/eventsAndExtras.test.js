/*
 * Extra coverage for starboard that handleStarboard.test.js leaves out:
 *
 *   - the thin event wrappers (messageReactionAdd / messageReactionRemove) that
 *     forward to handleStarboard with the correct isReactionRemove flag, and
 *     declare allowPartial
 *   - handleStarboard guards: bot-not-ready, non-guild message
 *   - partial reaction / message fetching before processing
 *   - nsfw mismatch (nsfw source into a non-nsfw board) is skipped
 *   - image resolution: archived attachment is used, else a URL scraped from the
 *     message content, else %image% is null
 *
 * embedTypeV2 / archiveDiscordAttachment are mocked so we can inspect the
 * placeholder map handed to the embed renderer.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn().mockResolvedValue({content: 'rendered'}),
    disableModule: jest.fn(),
    formatDiscordUserName: (u) => (u && u.tag) || 'user',
    archiveDiscordAttachment: jest.fn().mockResolvedValue(null)
}));

const helpers = require('../../src/functions/helpers');
const handleStarboard = require('../../modules/starboard/handleStarboard');
const addEvent = require('../../modules/starboard/events/messageReactionAdd');
const removeEvent = require('../../modules/starboard/events/messageReactionRemove');

jest.mock('../../modules/starboard/handleStarboard');

beforeEach(() => {
    handleStarboard.mockReset();
    handleStarboard.mockResolvedValue();
});

describe('starboard reaction event wrappers', () => {
    test('messageReactionAdd forwards with isReactionRemove=false and allows partials', async () => {
        const client = {};
        const reaction = {};
        const user = {id: 'u'};
        await addEvent.run(client, reaction, user);
        expect(handleStarboard).toHaveBeenCalledWith(client, reaction, user, false);
        expect(addEvent.allowPartial).toBe(true);
    });

    test('messageReactionRemove forwards with isReactionRemove=true and allows partials', async () => {
        const client = {};
        const reaction = {};
        const user = {id: 'u'};
        await removeEvent.run(client, reaction, user);
        expect(handleStarboard).toHaveBeenCalledWith(client, reaction, user, true);
        expect(removeEvent.allowPartial).toBe(true);
    });
});

describe('handleStarboard extra branches', () => {
    // Use the real handleStarboard for these (un-mock just for this block).
    const realHandle = jest.requireActual('../../modules/starboard/handleStarboard');

    function makeStarConfig(overrides = {}) {
        return {
            emoji: '⭐',
            minStars: 3,
            starsPerHour: 5,
            selfStar: false,
            channelId: 'board',
            excludedChannels: [],
            excludedRoles: [],
            message: 'cfg', ...overrides
        };
    }

    function makeMsg(overrides = {}) {
        return {
            id: 'msg1',
            guild: {id: 'g1'},
            partial: false,
            url: 'https://d/msg1',
            content: '',
            channel: {
                id: 'src',
                name: 'general',
                nsfw: false
            },
            author: {
                id: 'author1',
                username: 'Author',
                tag: 'Author#1'
            },
            member: {
                displayName: 'Author',
                displayAvatarURL: () => 'avatar',
                roles: {cache: {has: () => false}}
            },
            attachments: {
                size: 0,
                first: () => null
            },
            fetch: jest.fn().mockResolvedValue(),
            ...overrides
        };
    }

    function makeReaction(msg, overrides = {}) {
        return {
            message: msg,
            partial: false,
            count: 4,
            emoji: {toString: () => '⭐'},
            users: {
                remove: jest.fn().mockResolvedValue(),
                cache: {has: () => false}
            },
            fetch: jest.fn(),
            ...overrides
        };
    }

    function makeClient(cfg, {board} = {}) {
        const channel = board || {
            nsfw: false,
            send: jest.fn().mockResolvedValue({id: 'posted'}),
            messages: {fetch: jest.fn().mockResolvedValue(null)}
        };
        return {
            botReadyAt: Date.now(),
            guildID: 'g1',
            channels: {cache: {get: (id) => (id === cfg.channelId ? channel : null)}},
            configurations: {starboard: {config: cfg}},
            models: {
                starboard: {
                    StarUser: {
                        findAll: jest.fn().mockResolvedValue([]),
                        create: jest.fn().mockResolvedValue()
                    },
                    StarMsg: {
                        findOne: jest.fn().mockResolvedValue(null),
                        create: jest.fn().mockResolvedValue(),
                        destroy: jest.fn()
                    }
                }
            },
            _channel: channel
        };
    }

    beforeEach(() => {
        helpers.embedTypeV2.mockClear().mockResolvedValue({content: 'rendered'});
        helpers.archiveDiscordAttachment.mockClear().mockResolvedValue(null);
    });

    test('does nothing before the bot is ready', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        client.botReadyAt = null;
        await realHandle(client, makeReaction(makeMsg()), {id: 'u'}, false);
        expect(client.models.starboard.StarUser.findAll).not.toHaveBeenCalled();
    });

    test('ignores reactions on messages without a guild', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        await realHandle(client, makeReaction(makeMsg({guild: null})), {id: 'u'}, false);
        expect(client.models.starboard.StarUser.findAll).not.toHaveBeenCalled();
    });

    test('fetches a partial reaction before processing', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        const msg = makeMsg();
        const fetched = makeReaction(msg, {emoji: {toString: () => '🔥'}}); // non-matching to short-circuit
        const reaction = makeReaction(msg, {
            partial: true,
            fetch: jest.fn().mockResolvedValue(fetched)
        });
        await realHandle(client, reaction, {id: 'u'}, false);
        expect(reaction.fetch).toHaveBeenCalled();
    });

    test('skips an nsfw source message posted to a non-nsfw board', async () => {
        const cfg = makeStarConfig();
        const board = {
            nsfw: false,
            send: jest.fn(),
            messages: {fetch: jest.fn().mockResolvedValue(null)}
        };
        const client = makeClient(cfg, {board});
        const msg = makeMsg({
            channel: {
                id: 'src',
                name: 'nsfw',
                nsfw: true
            }
        });
        await realHandle(client, makeReaction(msg), {id: 'u'}, false);
        expect(client.models.starboard.StarUser.findAll).not.toHaveBeenCalled();
    });

    test('uses an archived attachment image when present', async () => {
        const cfg = makeStarConfig();
        helpers.archiveDiscordAttachment.mockResolvedValue('https://archive/img.png');
        const client = makeClient(cfg);
        const msg = makeMsg({
            attachments: {
                size: 1,
                first: () => ({url: 'https://d/att.png'})
            }
        });
        await realHandle(client, makeReaction(msg, {count: 4}), {id: 'u'}, false);
        const placeholders = helpers.embedTypeV2.mock.calls[0][1];
        expect(placeholders['%image%']).toBe('https://archive/img.png');
    });

    test('falls back to an image URL scraped from the message content', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        const msg = makeMsg({content: 'look at this https://example.com/pic.jpg cool'});
        await realHandle(client, makeReaction(msg, {count: 4}), {id: 'u'}, false);
        const placeholders = helpers.embedTypeV2.mock.calls[0][1];
        expect(placeholders['%image%']).toBe('https://example.com/pic.jpg');
    });

    test('leaves %image% null when there is no attachment or image URL', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        await realHandle(client, makeReaction(makeMsg(), {count: 4}), {id: 'u'}, false);
        const placeholders = helpers.embedTypeV2.mock.calls[0][1];
        expect(placeholders['%image%']).toBeNull();
    });
});