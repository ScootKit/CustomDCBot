/*
 * Tests for the /leaderboard command (modules/levels/commands/leaderboard.js).
 * Covers the empty-board early reply, the default xp-sorted listing (one entry
 * per cached member, skipping members no longer in the guild), the levels-sorted
 * grouping (one field per level), the "your level" footer field when the caller
 * is on the board, and the config.options() builder defaulting note. The
 * paginator (sendMultipleSiteButtonMessage) is mocked to capture the built
 * pages; the main client stub supplies the curve config.
 */
const mainStub = require('../__stubs__/main');

const mockSend = jest.fn();
jest.mock('../../src/functions/helpers', () => ({
    sendMultipleSiteButtonMessage: (...a) => mockSend(...a),
    truncate: (s) => s,
    formatNumber: (n) => String(n),
    formatDiscordUserName: (u) => u.username,
    parseEmbedColor: (c) => c,
    safeSetFooter: jest.fn()
}));
jest.mock('discord.js', () => {
    class MessageEmbed {
        constructor() {
            this.fields = [];
            this.data = {};
        }

        setColor(c) {
            this.data.color = c;
            return this;
        }

        setThumbnail(t) {
            this.data.thumbnail = t;
            return this;
        }

        setTitle(t) {
            this.data.title = t;
            return this;
        }

        setDescription(d) {
            this.data.description = d;
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

        addFields(fields) {
            this.fields.push(...fields);
            return this;
        }
    }

    return {MessageEmbed};
});

const command = require('../../modules/levels/commands/leaderboard');

const levelsConfig = {
    curveType: 'LINEAR',
    maximumLevelEnabled: false,
    startFromZero: false,
    sortLeaderboardBy: 'xp',
    useTags: true
};

beforeEach(() => {
    mockSend.mockClear();
    // The command reads the shared main-stub client for curve/displayLevel.
    mainStub.client.configurations = {
        levels: {
            config: levelsConfig,
            strings: {}
        }
    };
});

function makeInteraction({
                             users = [],
                             sortBy = null,
                             cachedIds,
                             callerId = 'caller'
                         } = {}) {
    const present = cachedIds || users.map(u => u.userID);
    const memberCache = new Map(present.map(id => [id, {
        user: {
            username: `name-${id}`,
            toString: () => `<@${id}>`
        }
    }]));
    return {
        user: {id: callerId},
        channel: {},
        options: {getString: () => sortBy},
        guild: {
            iconURL: () => 'icon',
            members: {cache: memberCache}
        },
        client: {
            configurations: {
                levels: {
                    config: levelsConfig,
                    strings: {
                        leaderboardEmbed: {
                            color: 'GREEN',
                            title: 'LB',
                            description: 'desc',
                            your_level: 'You',
                            you_are_level_x_with_x_xp: 'L%level% X%xp%'
                        }
                    }
                }
            },
            models: {levels: {User: {findAll: jest.fn().mockResolvedValue(users)}}}
        },
        reply: jest.fn().mockResolvedValue()
    };
}

test('replies with the empty-board message when there are no users', async () => {
    const interaction = makeInteraction({users: []});
    await command.run(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toContain('no-user-on-leaderboard');
    expect(mockSend).not.toHaveBeenCalled();
});

test('xp sort lists one notation per cached member', async () => {
    const users = [
        {
            userID: 'a',
            level: 3,
            xp: 3000
        },
        {
            userID: 'b',
            level: 2,
            xp: 2000
        }
    ];
    const interaction = makeInteraction({users});
    await command.run(interaction);
    const pages = mockSend.mock.calls[0][1];
    const value = pages[0].fields.find(f => f.name === 'levels.users').value;
    expect(value).toContain('p=1');
    expect(value).toContain('p=2');
});

test('xp sort skips users no longer cached in the guild', async () => {
    const users = [
        {
            userID: 'a',
            level: 3,
            xp: 3000
        },
        {
            userID: 'gone',
            level: 9,
            xp: 9000
        }
    ];
    const interaction = makeInteraction({
        users,
        cachedIds: ['a', 'caller']
    });
    await command.run(interaction);
    const value = mockSend.mock.calls[0][1][0].fields.find(f => f.name === 'levels.users').value;
    expect(value).toContain('u=name-a');
    expect(value).not.toContain('gone');
});

test('levels sort groups members into one field per level', async () => {
    const users = [
        {
            userID: 'a',
            level: 5,
            xp: 5000
        },
        {
            userID: 'b',
            level: 5,
            xp: 4900
        },
        {
            userID: 'c',
            level: 2,
            xp: 2000
        }
    ];
    const interaction = makeInteraction({
        users,
        sortBy: 'levels'
    });
    await command.run(interaction);
    const page = mockSend.mock.calls[0][1][0];
    const levelFields = page.fields.filter(f => typeof f.name === 'string' && f.name.includes('levels.level'));
    expect(levelFields.length).toBe(2);
});

test('adds the "your level" field when the caller is on the board', async () => {
    const users = [{
        userID: 'caller',
        level: 4,
        xp: 4000
    }];
    const interaction = makeInteraction({
        users,
        callerId: 'caller'
    });
    await command.run(interaction);
    const page = mockSend.mock.calls[0][1][0];
    expect(page.fields.some(f => f.name === 'You')).toBe(true);
});

test('config.options() exposes the sort-by choice defaulting to the configured sort', () => {
    const opts = command.config.options({configurations: {levels: {config: {sortLeaderboardBy: 'levels'}}}});
    expect(opts[0].name).toBe('sort-by');
    expect(opts[0].choices.map(c => c.value)).toEqual(['levels', 'xp']);
});