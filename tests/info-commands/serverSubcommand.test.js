/*
 * Tests for the /info server subcommand (modules/info-commands/commands/info.js).
 * It assembles a server-overview embed: owner (via fetchOwner), ban count (via
 * bans.fetch), member/channel tables, and a guild-features list. Covers the
 * happy path field assembly, the optional afk/description/rules/system fields,
 * and the "no features" fallback. MessageEmbed + helpers mocked.
 */
jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn(),
    pufferStringToSize: (s) => String(s),
    dateToDiscordTimestamp: (d) => `<ts:${d}>`,
    formatDiscordUserName: (u) => u.username,
    formatNumber: (n) => String(n),
    parseEmbedColor: (c) => c,
    safeSetFooter: jest.fn(),
    moduleEnabled: () => false
}));
jest.mock('discord.js', () => {
    const actual = jest.requireActual('discord.js');

    class MessageEmbed {
        constructor() {
            this.fields = [];
            this.data = {};
        }

        setTitle(t) {
            this.data.title = t;
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

        setImage(i) {
            this.data.image = i;
            return this;
        }

        setDescription(d) {
            this.data.description = d;
            return this;
        }

        setTimestamp() {
            this.data.timestamp = true;
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
        ChannelType: actual.ChannelType,
        MessageEmbed
    };
});

const {ChannelType} = require('discord.js');
const info = require('../../modules/info-commands/commands/info');

const strings = {
    serverinfo: {
        afkChannel: 'AFK',
        id: 'Id',
        owner: 'Owner',
        boosts: 'Boosts',
        emojiCount: 'Emojis',
        stickerCount: 'Stickers',
        roleCount: 'Roles',
        rulesChannel: 'Rules',
        dcSystemChannel: 'System',
        verificationLevel: 'Verify',
        banCount: 'Bans',
        createdAt: 'Created',
        members: 'Members',
        channels: 'Channels',
        features: 'Features',
        noFeaturesEnabled: 'NoFeatures'
    }
};

function channels(list) {
    const map = new Map(list.map((v, i) => [String(i), v]));
    map.filter = (fn) => {
        const m = new Map([...map].filter(([, v]) => fn(v)));
        m.filter = map.filter;
        return m;
    };
    return map;
}

function makeGuild(over = {}) {
    return {
        id: 'g1',
        name: 'My Server',
        iconURL: () => 'icon',
        bannerURL: () => 'banner',
        afkChannel: null,
        afkChannelID: null,
        afkTimeout: 300,
        description: null,
        premiumTier: 2,
        premiumSubscriptionCount: 10,
        emojis: {cache: {size: 5}},
        stickers: {cache: {size: 0}},
        roles: {cache: {size: 8}},
        rulesChannelID: null,
        systemChannelID: null,
        verificationLevel: 1,
        bans: {fetch: jest.fn().mockResolvedValue({size: 3})},
        createdAt: new Date('2020-01-01'),
        fetchOwner: jest.fn().mockResolvedValue({id: 'owner1'}),
        members: {
            cache: channels([{
                user: {bot: false},
                presence: {status: 'online'}
            }, {
                user: {bot: true},
                presence: null
            }])
        },
        channels: {cache: channels([{type: ChannelType.GuildText}, {type: ChannelType.GuildVoice}])},
        features: [],
        ...over
    };
}

function makeInteraction(guild) {
    return {
        client: {
            configurations: {'info-commands': {strings}},
            strings: {disableFooterTimestamp: true}
        },
        guild,
        editReply: jest.fn().mockResolvedValue()
    };
}

test('builds the overview with owner, bans and member/channel tables', async () => {
    const guild = makeGuild();
    const interaction = makeInteraction(guild);
    await info.subcommands.server(interaction);
    expect(guild.fetchOwner).toHaveBeenCalled();
    expect(guild.bans.fetch).toHaveBeenCalled();
    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const names = embed.fields.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining(['Id', 'Owner', 'Bans', 'Members', 'Channels', 'Features']));
    expect(embed.fields.find(f => f.name === 'Bans').value).toBe('3');
});

test('includes optional afk/description/rules/system fields when present', async () => {
    const guild = makeGuild({
        afkChannel: {},
        afkChannelID: 'afk1',
        description: 'A cool place',
        rulesChannelID: 'rules1',
        systemChannelID: 'sys1'
    });
    const interaction = makeInteraction(guild);
    await info.subcommands.server(interaction);
    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toBe('A cool place');
    const names = embed.fields.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining(['AFK', 'Rules', 'System']));
});

test('uses the no-features fallback when the guild has no features', async () => {
    const guild = makeGuild({features: []});
    const interaction = makeInteraction(guild);
    await info.subcommands.server(interaction);
    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const features = embed.fields.find(f => f.name === 'Features');
    expect(features.value).toContain('NoFeatures');
});

test('renders a capitalized feature list when features exist', async () => {
    const guild = makeGuild({features: ['COMMUNITY', 'BANNER']});
    const interaction = makeInteraction(guild);
    await info.subcommands.server(interaction);
    const features = interaction.editReply.mock.calls[0][0].embeds[0].fields.find(f => f.name === 'Features');
    expect(features.value).toContain('Community');
    expect(features.value).toContain('Banner');
});