/*
 * Behavior tests for the starboard reaction handler (handleStarboard.js).
 *
 * Covers the branching logic that decides whether a starred message is posted,
 * updated, or removed from the starboard channel:
 *   - early-returns: wrong guild, wrong emoji, missing starboard channel,
 *     excluded channels / roles, nsfw mismatch
 *   - self-star removal when selfStar is disabled
 *   - per-hour star-rate limiting (StarUser tally within the last hour)
 *   - threshold logic: below minStars does nothing on add, and deletes the
 *     starboard message + DB row on a reaction-remove that drops below minStars
 *   - posting a NEW starboard message (channel.send + StarMsg.create) when over
 *     threshold and not yet posted, vs EDITING the existing one
 *   - self-star vote discounting of the author's own reaction
 *
 * The Discord embed builder (embedTypeV2) and attachment archiver are mocked so
 * the test isolates the handler's decision logic, not embed formatting.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn().mockResolvedValue({content: 'rendered'}),
    disableModule: jest.fn(),
    formatDiscordUserName: (u) => (u && u.tag) || 'user',
    archiveDiscordAttachment: jest.fn().mockResolvedValue(null)
}));

const helpers = require('../../src/functions/helpers');
const handleStarboard = require('../../modules/starboard/handleStarboard');

function makeStarConfig(overrides = {}) {
    return {
        emoji: '⭐',
        minStars: 3,
        starsPerHour: 5,
        selfStar: false,
        channelId: 'starboard-chan',
        excludedChannels: [],
        excludedRoles: [],
        message: 'cfg-message',
        ...overrides
    };
}

function makeMsg(overrides = {}) {
    return {
        id: 'msg1',
        guild: {id: 'g1'},
        partial: false,
        url: 'https://discord/msg1',
        content: '',
        channel: {
            id: 'src-chan',
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
        ...overrides
    };
}

function makeClient(starConfig, {
    starUsers = [],
    starMsg = null,
    starboardChannel
} = {}) {
    const channel = starboardChannel || {
        nsfw: false,
        send: jest.fn().mockResolvedValue({id: 'posted-msg'}),
        messages: {fetch: jest.fn().mockResolvedValue(null)}
    };
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        channels: {cache: {get: (id) => (id === starConfig.channelId ? channel : null)}},
        configurations: {starboard: {config: starConfig}},
        models: {
            starboard: {
                StarUser: {
                    findAll: jest.fn().mockResolvedValue(starUsers),
                    create: jest.fn().mockResolvedValue()
                },
                StarMsg: {
                    findOne: jest.fn().mockResolvedValue(starMsg),
                    create: jest.fn().mockResolvedValue(),
                    destroy: jest.fn().mockResolvedValue()
                }
            }
        },
        _channel: channel
    };
}

beforeEach(() => {
    helpers.embedTypeV2.mockClear();
    helpers.embedTypeV2.mockResolvedValue({content: 'rendered'});
    helpers.disableModule.mockClear();
});

describe('starboard guard clauses', () => {
    test('ignores reactions from other guilds', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        const msg = makeMsg({guild: {id: 'other-guild'}});
        const reaction = makeReaction(msg);
        await handleStarboard(client, reaction, {id: 'u1'}, false);
        expect(client.models.starboard.StarUser.create).not.toHaveBeenCalled();
        expect(client._channel.send).not.toHaveBeenCalled();
    });

    test('ignores reactions with a non-matching emoji', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        const msg = makeMsg();
        const reaction = makeReaction(msg, {emoji: {toString: () => '🔥'}});
        await handleStarboard(client, reaction, {id: 'u1'}, false);
        expect(client.models.starboard.StarUser.findAll).not.toHaveBeenCalled();
    });

    test('disables the module when minStars is not a number', async () => {
        const cfg = makeStarConfig({minStars: 'abc'});
        const client = makeClient(cfg);
        await handleStarboard(client, makeReaction(makeMsg()), {id: 'u1'}, false);
        expect(helpers.disableModule).toHaveBeenCalledWith('starboard', expect.any(String));
    });

    test('disables the module when the starboard channel is missing', async () => {
        const cfg = makeStarConfig();
        const client = makeClient(cfg);
        client.channels.cache.get = () => null;
        await handleStarboard(client, makeReaction(makeMsg()), {id: 'u1'}, false);
        expect(helpers.disableModule).toHaveBeenCalledWith('starboard', expect.any(String));
    });

    test('ignores reactions in excluded channels', async () => {
        const cfg = makeStarConfig({excludedChannels: ['src-chan']});
        const client = makeClient(cfg);
        await handleStarboard(client, makeReaction(makeMsg()), {id: 'u1'}, false);
        expect(client.models.starboard.StarUser.findAll).not.toHaveBeenCalled();
    });

    test('ignores reactions from members with an excluded role', async () => {
        const cfg = makeStarConfig({excludedRoles: ['role-x']});
        const client = makeClient(cfg);
        const msg = makeMsg();
        msg.member.roles.cache.has = (r) => r === 'role-x';
        await handleStarboard(client, makeReaction(msg), {id: 'u1'}, false);
        expect(client.models.starboard.StarUser.findAll).not.toHaveBeenCalled();
    });
});

describe('self-star handling', () => {
    test('removes the reaction when a user stars their own message and selfStar is off', async () => {
        const cfg = makeStarConfig({selfStar: false});
        const client = makeClient(cfg);
        const msg = makeMsg();
        const reaction = makeReaction(msg);
        await handleStarboard(client, reaction, {id: 'author1'}, false);
        expect(reaction.users.remove).toHaveBeenCalledWith('author1');
        expect(client.models.starboard.StarUser.create).not.toHaveBeenCalled();
    });

    test('allows self-stars when selfStar is enabled', async () => {
        const cfg = makeStarConfig({selfStar: true});
        const client = makeClient(cfg);
        const msg = makeMsg();
        const reaction = makeReaction(msg, {count: 4});
        await handleStarboard(client, reaction, {id: 'author1'}, false);
        expect(client.models.starboard.StarUser.create).toHaveBeenCalled();
    });
});

describe('per-hour rate limiting', () => {
    test('blocks and removes the star once the hourly limit is reached', async () => {
        const cfg = makeStarConfig({starsPerHour: 2});
        const starUsers = [
            {dataValues: {createdAt: Date.now()}},
            {dataValues: {createdAt: Date.now()}}
        ];
        const client = makeClient(cfg, {starUsers});
        const msg = makeMsg();
        const reaction = makeReaction(msg);
        const user = {
            id: 'u1',
            send: jest.fn().mockResolvedValue()
        };
        await handleStarboard(client, reaction, user, false);
        expect(user.send).toHaveBeenCalled();
        expect(reaction.users.remove).toHaveBeenCalledWith('u1');
        expect(client.models.starboard.StarUser.create).not.toHaveBeenCalled();
    });
});

describe('threshold logic', () => {
    test('does nothing on add when the count is below minStars', async () => {
        const cfg = makeStarConfig({minStars: 5});
        const client = makeClient(cfg);
        const reaction = makeReaction(makeMsg(), {count: 4});
        await handleStarboard(client, reaction, {id: 'u1'}, false);
        // It still records the star, but never posts to the board.
        expect(client._channel.send).not.toHaveBeenCalled();
        expect(helpers.embedTypeV2).not.toHaveBeenCalled();
    });

    test('deletes the starboard message and DB row when a remove drops below minStars', async () => {
        const cfg = makeStarConfig({minStars: 5});
        const starboardMsg = {
            delete: jest.fn(),
            edit: jest.fn()
        };
        const channel = {
            nsfw: false,
            send: jest.fn(),
            messages: {fetch: jest.fn().mockResolvedValue(starboardMsg)}
        };
        const client = makeClient(cfg, {
            starMsg: {starMsg: 'sb-msg'},
            starboardChannel: channel
        });
        const reaction = makeReaction(makeMsg(), {count: 2});
        await handleStarboard(client, reaction, {id: 'u1'}, true);
        expect(starboardMsg.delete).toHaveBeenCalled();
        expect(client.models.starboard.StarMsg.destroy).toHaveBeenCalledWith({where: {msgId: 'msg1'}});
    });

    test('posts a NEW starboard message when over threshold and none exists yet', async () => {
        const cfg = makeStarConfig({minStars: 3});
        const client = makeClient(cfg, {starMsg: null});
        const reaction = makeReaction(makeMsg(), {count: 4});
        await handleStarboard(client, reaction, {id: 'u1'}, false);
        expect(client._channel.send).toHaveBeenCalledWith({content: 'rendered'});
        expect(client.models.starboard.StarMsg.create).toHaveBeenCalledWith(
            expect.objectContaining({
                msgId: 'msg1',
                starMsg: 'posted-msg'
            })
        );
    });

    test('EDITS the existing starboard message instead of re-posting', async () => {
        const cfg = makeStarConfig({minStars: 3});
        const starboardMsg = {
            edit: jest.fn(),
            delete: jest.fn()
        };
        const channel = {
            nsfw: false,
            send: jest.fn(),
            messages: {fetch: jest.fn().mockResolvedValue(starboardMsg)}
        };
        const client = makeClient(cfg, {
            starMsg: {starMsg: 'sb-msg'},
            starboardChannel: channel
        });
        const reaction = makeReaction(makeMsg(), {count: 4});
        await handleStarboard(client, reaction, {id: 'u1'}, false);
        expect(starboardMsg.edit).toHaveBeenCalledWith({content: 'rendered'});
        expect(channel.send).not.toHaveBeenCalled();
        expect(client.models.starboard.StarMsg.create).not.toHaveBeenCalled();
    });

    test('discounts the author own reaction from the count when selfStar is off', async () => {
        // count is 3 but one of them is the author's, so effective count is 2 < minStars(3)
        const cfg = makeStarConfig({
            minStars: 3,
            selfStar: false
        });
        const client = makeClient(cfg);
        const msg = makeMsg();
        const reaction = makeReaction(msg, {
            count: 3,
            users: {
                remove: jest.fn(),
                cache: {has: (id) => id === 'author1'}
            }
        });
        await handleStarboard(client, reaction, {id: 'u1'}, false);
        expect(client._channel.send).not.toHaveBeenCalled();
    });
});