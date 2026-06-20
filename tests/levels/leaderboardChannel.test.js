/*
 * Tests for the levels live-leaderboard channel updater
 * (modules/levels/leaderboardChannel.js). Covers:
 *   - the no-channel-configured and unchanged (non-force) early returns,
 *   - the missing/non-text channel error,
 *   - building + sending a fresh leaderboard message (persisting its id),
 *   - editing an existing one,
 *   - the empty-board placeholder,
 *   - registerNeededEdit flipping the changed flag so a non-force update runs.
 * discord.js + helpers are mocked; LINEAR curve keeps xp numbers simple.
 */
const mainStub = require('../__stubs__/main');

jest.mock('../../src/functions/helpers', () => ({
    formatDiscordUserName: (u) => u.username,
    formatNumber: (n) => String(n),
    parseEmbedColor: (c) => c,
    safeSetFooter: jest.fn()
}));
jest.mock('discord.js', () => {
    const ChannelType = {GuildText: 0};

    class MessageEmbed {
        constructor() {
            this.fields = [];
            this.data = {};
        }

        setTitle(t) {
            this.data.title = t;
            return this;
        }

        setDescription(d) {
            this.data.description = d;
            return this;
        }

        setColor(c) {
            this.data.color = c;
            return this;
        }

        setThumbnail(t) {
            this.data.thumbnail = t;
            return this;
        }

        setTimestamp() {
            return this;
        }

        addField(name, value, inline) {
            this.fields.push({
                name,
                value,
                inline
            });
            return this;
        }
    }

    return {
        ChannelType,
        MessageEmbed
    };
});

const {ChannelType} = require('discord.js');
const lb = require('../../modules/levels/leaderboardChannel');

const strings = {
    liveLeaderBoardEmbed: {
        title: 'T',
        description: 'D',
        color: 'GREEN',
        button: 'Show'
    }
};

function makeClient({
                        leaderboardChannel = 'lb1',
                        channel,
                        users = [],
                        row
                    } = {}) {
    const conf = {
        levels: {
            config: {
                curveType: 'LINEAR',
                maximumLevelEnabled: false,
                startFromZero: false,
                'leaderboard-channel': leaderboardChannel,
                'leaderboard-channel-max-amount': 60,
                useTags: true
            },
            strings
        }
    };
    mainStub.client.configurations = conf;
    return {
        configurations: conf,
        strings: {disableFooterTimestamp: true},
        logger: {
            error: jest.fn(),
            info: jest.fn()
        },
        channels: {fetch: jest.fn().mockResolvedValue(channel)},
        models: {
            levels: {
                LiveLeaderboard: {
                    findOrCreate: jest.fn().mockResolvedValue([row || {
                        messageID: null,
                        save: jest.fn().mockResolvedValue()
                    }])
                },
                User: {findAll: jest.fn().mockResolvedValue(users)}
            }
        }
    };
}

function makeChannel(memberIds = [], {existing} = {}) {
    const cache = new Map(memberIds.map(id => [id, {
        user: {
            username: `n-${id}`,
            toString: () => `<@${id}>`
        }
    }]));
    return {
        id: 'lb1',
        type: ChannelType.GuildText,
        guild: {
            members: {cache},
            iconURL: () => 'icon'
        },
        messages: {fetch: jest.fn().mockResolvedValue(existing || null)},
        send: jest.fn().mockResolvedValue({
            id: 'sent1',
            url: 'u'
        })
    };
}

test('returns immediately when no leaderboard channel is configured', async () => {
    const client = makeClient({leaderboardChannel: null});
    await lb.updateLeaderBoard(client, true);
    expect(client.channels.fetch).not.toHaveBeenCalled();
});

test('non-force update is skipped until a change is registered', async () => {
    const channel = makeChannel();
    const client = makeClient({channel});
    await lb.updateLeaderBoard(client, false);
    expect(client.channels.fetch).not.toHaveBeenCalled();

    // registerNeededEdit flips the module-level "changed" flag.
    lb.registerNeededEdit();
    await lb.updateLeaderBoard(client, false);
    expect(client.channels.fetch).toHaveBeenCalled();
});

test('errors when the configured channel is missing or not text based', async () => {
    const client = makeClient({channel: null});
    await lb.updateLeaderBoard(client, true);
    expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('leaderboard-channel-not-found'));
});

test('sends a fresh leaderboard and persists the message id', async () => {
    const channel = makeChannel(['a', 'b']);
    const row = {
        messageID: null,
        save: jest.fn().mockResolvedValue()
    };
    const client = makeClient({
        channel,
        row,
        users: [{
            userID: 'a',
            level: 3,
            xp: 3000
        }, {
            userID: 'b',
            level: 2,
            xp: 2000
        }]
    });
    await lb.updateLeaderBoard(client, true);
    expect(channel.send).toHaveBeenCalled();
    expect(row.messageID).toBe('sent1');
    expect(row.save).toHaveBeenCalled();
    const field = channel.send.mock.calls[0][0].embeds[0].fields[0];
    expect(field.value).toContain('p=1');
    expect(field.value).toContain('p=2');
});

test('edits an existing leaderboard message', async () => {
    const existing = {
        id: 'm1',
        url: 'http://m',
        edit: jest.fn().mockResolvedValue()
    };
    const channel = makeChannel(['a'], {existing});
    const row = {
        messageID: 'm1',
        save: jest.fn()
    };
    const client = makeClient({
        channel,
        row,
        users: [{
            userID: 'a',
            level: 1,
            xp: 100
        }]
    });
    await lb.updateLeaderBoard(client, true);
    expect(existing.edit).toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
});

test('shows the empty placeholder when no cached users qualify', async () => {
    const channel = makeChannel([]); // no members cached
    const client = makeClient({
        channel,
        users: [{
            userID: 'ghost',
            level: 5,
            xp: 5000
        }]
    });
    await lb.updateLeaderBoard(client, true);
    const field = channel.send.mock.calls[0][0].embeds[0].fields[0];
    expect(field.value).toContain('no-user-on-leaderboard');
});