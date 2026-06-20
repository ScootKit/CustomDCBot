/*
 * Tests for the /profile command (modules/levels/commands/profile.js). Covers:
 *   - user-not-found early reply when the target has no levels row.
 *   - the happy path embed (messages/xp/level fields + joinedAt).
 *   - the daily-counters reset display when the stored reset date is stale.
 *   - the role-factor field, which only appears when a member holds multiplier
 *     roles (getMemberRoleFactor !== 1).
 * MessageEmbed and helpers are mocked so we can assert on the field set.
 */
jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((i) => ({_embedType: i})),
    formatDate: (d) => `date:${d}`,
    formatNumber: (n) => String(n),
    parseEmbedColor: (c) => c,
    safeSetFooter: jest.fn(),
    formatVoiceDuration: (s) => `${s}s`,
    todayInServerTZ: () => '2026-06-02'
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
    }

    return {MessageEmbed};
});

const command = require('../../modules/levels/commands/profile');

const strings = {
    embed: {
        color: 'GREEN',
        title: '%username%',
        description: '%username%',
        messages: 'Messages',
        xp: 'XP',
        level: 'Level',
        messagesToday: 'MsgToday',
        voiceTimeToday: 'VoiceToday',
        roleFactor: 'RoleFactor',
        joinedAt: 'JoinedAt'
    },
    user_not_found: 'no-user'
};

function makeMember({
                        roleIds = [],
                        multRoles = {}
                    } = {}) {
    const cache = new Map(roleIds.map(id => [id, {id}]));
    cache.filter = (fn) => {
        const arr = [...cache.values()].filter(fn);
        return {values: () => arr[Symbol.iterator]()};
    };
    const member = {
        user: {
            id: 'u1',
            username: 'Alice',
            avatarURL: () => 'a'
        },
        joinedAt: new Date('2025-01-01'),
        roles: {cache}
    };
    // getMemberRoleFactor reads member.client.configurations; link it lazily.
    return member;
}

function makeInteraction({
                             user,
                             member,
                             config = {}
                         } = {}) {
    const client = {
        configurations: {
            levels: {
                config: {
                    curveType: 'LINEAR',
                    maximumLevelEnabled: false,
                    startFromZero: false,
                    multiplication_roles: {}, ...config
                },
                strings
            }
        }
    };
    if (member) member.client = client;
    return {
        member,
        options: {getUser: () => null},
        guild: {members: {fetch: jest.fn()}},
        client,
        models: undefined,
        reply: jest.fn().mockResolvedValue()
    };
}

function attachModels(interaction, user) {
    interaction.client.models = {levels: {User: {findOne: jest.fn().mockResolvedValue(user)}}};
}

test('replies user_not_found when the member has no levels row', async () => {
    const interaction = makeInteraction({member: makeMember()});
    attachModels(interaction, null);
    await command.run(interaction);
    expect(interaction.reply.mock.calls[0][0]._embedType).toBe('no-user');
});

test('builds a profile embed with messages, xp, level and joinedAt', async () => {
    const interaction = makeInteraction({member: makeMember()});
    attachModels(interaction, {
        level: 3,
        xp: 5000,
        messages: 42,
        dailyResetDate: '2026-06-02',
        dailyMessages: 4,
        dailyVoiceSeconds: 120
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const names = embed.fields.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining(['Messages', 'XP', 'Level', 'MsgToday', 'VoiceToday', 'JoinedAt']));
    expect(embed.fields.find(f => f.name === 'Messages').value).toBe('42');
});

test('shows 0 daily counters when the stored reset date is stale', async () => {
    const interaction = makeInteraction({member: makeMember()});
    attachModels(interaction, {
        level: 1,
        xp: 0,
        messages: 1,
        dailyResetDate: '2026-01-01',
        dailyMessages: 99,
        dailyVoiceSeconds: 500
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    expect(embed.fields.find(f => f.name === 'MsgToday').value).toBe('0');
    expect(embed.fields.find(f => f.name === 'VoiceToday').value).toBe('0s');
});

test('adds the role-factor field when the member has multiplier roles', async () => {
    const member = makeMember({roleIds: ['boost']});
    const interaction = makeInteraction({
        member,
        config: {multiplication_roles: {boost: '2'}}
    });
    attachModels(interaction, {
        level: 2,
        xp: 100,
        messages: 5,
        dailyResetDate: '2026-06-02',
        dailyMessages: 0,
        dailyVoiceSeconds: 0
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const rf = embed.fields.find(f => f.name === 'RoleFactor');
    expect(rf).toBeDefined();
    expect(rf.value).toContain('<@&boost>: 2x');
});

test('omits the role-factor field when factor is 1', async () => {
    const interaction = makeInteraction({member: makeMember()});
    attachModels(interaction, {
        level: 2,
        xp: 100,
        messages: 5,
        dailyResetDate: '2026-06-02',
        dailyMessages: 0,
        dailyVoiceSeconds: 0
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    expect(embed.fields.find(f => f.name === 'RoleFactor')).toBeUndefined();
});