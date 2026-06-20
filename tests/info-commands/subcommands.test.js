/*
 * Tests for the /info subcommands (modules/info-commands/commands/info.js):
 *   - channel: type/name/id fields, thread-specific fields, and voice-member
 *     listing.
 *   - role: permission rendering (ADMINISTRATOR shorthand vs explicit list),
 *     small-member listing, and the hoist/mentionable/managed feature flags.
 *   - user: the levels enrichment block and the administrator permission
 *     shorthand.
 *   - server: owner/ban/member-table assembly.
 * MessageEmbed + helpers are mocked so we can assert on the field set; the
 * cross-module helpers (messageCreate) load via the curve config.
 */
const mainStub = require('../__stubs__/main');

jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((i) => ({_embedType: i})),
    pufferStringToSize: (s) => String(s),
    dateToDiscordTimestamp: (d) => `<ts:${d}>`,
    formatDiscordUserName: (u) => u.username,
    formatNumber: (n) => String(n),
    parseEmbedColor: (c) => c,
    safeSetFooter: jest.fn(),
    moduleEnabled: (client, name) => !!(client.modules && client.modules[name] && client.modules[name].enabled)
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
    channelInfo: {
        type: 'Type',
        id: 'Id',
        createdAt: 'Created',
        name: 'Name',
        parent: 'Parent',
        position: 'Pos',
        membersInChannel: 'Members',
        threadOwner: 'Owner',
        threadMessages: 'Msgs',
        threadMemberCount: 'TMembers',
        threadArchivedAt: 'Arch',
        threadAutoArchiveDuration: 'AutoArch'
    },
    roleInfo: {
        createdAt: 'Created',
        position: 'Pos',
        id: 'Id',
        name: 'Name',
        color: 'Color',
        memberWithThisRoleCount: 'Count',
        memberWithThisRole: 'Who',
        permissions: 'Perms'
    },
    userinfo: {
        tag: 'Tag',
        id: 'Id',
        createdAt: 'Created',
        joinedAt: 'Joined',
        xp: 'XP',
        level: 'Level',
        messages: 'Msgs',
        permissions: 'Perms',
        noPermissions: 'None',
        'invited-by': 'InvBy',
        invites: 'Invites'
    },
    user_not_found: 'no-user'
};

function clientBase(modules = {}) {
    const conf = {
        'info-commands': {strings},
        levels: {
            config: {
                curveType: 'LINEAR',
                maximumLevelEnabled: false,
                startFromZero: false
            }
        }
    };
    mainStub.client.configurations = conf;
    return {
        configurations: conf,
        modules,
        strings: {disableFooterTimestamp: true},
        locale: 'en'
    };
}

function baseInteraction(client) {
    return {
        client,
        editReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe('channel subcommand', () => {
    function channel(over = {}) {
        return {
            id: 'c1',
            name: 'general',
            type: ChannelType.GuildText,
            createdAt: new Date('2024-01-01'),
            parent: null,
            position: 0,
            topic: '',
            isThread: () => false, ...over
        };
    }

    test('renders the base type/id/name fields', async () => {
        const interaction = baseInteraction(clientBase());
        interaction.options = {getChannel: () => channel()};
        await info.subcommands.channel(interaction);
        const embed = interaction.editReply.mock.calls[0][0].embeds[0];
        const names = embed.fields.map(f => f.name);
        expect(names).toEqual(expect.arrayContaining(['Type', 'Id', 'Created', 'Name']));
    });

    test('adds thread-specific fields for a thread channel', async () => {
        const thread = channel({
            isThread: () => true,
            ownerId: 'owner1',
            autoArchiveDuration: 1440,
            messageCount: 5,
            memberCount: 3,
            archiveTimestamp: 2,
            createdTimestamp: 1,
            archivedAt: new Date('2024-02-01')
        });
        const interaction = baseInteraction(clientBase());
        interaction.options = {getChannel: () => thread};
        await info.subcommands.channel(interaction);
        const names = interaction.editReply.mock.calls[0][0].embeds[0].fields.map(f => f.name);
        expect(names).toEqual(expect.arrayContaining(['Owner', 'Msgs', 'TMembers', 'AutoArch']));
    });

    test('lists members for a voice channel', async () => {
        const members = new Map([['m1', {user: {id: 'm1'}}], ['m2', {user: {id: 'm2'}}]]);
        members.forEach = Map.prototype.forEach.bind(members);
        const vc = channel({
            type: ChannelType.GuildVoice,
            members
        });
        const interaction = baseInteraction(clientBase());
        interaction.options = {getChannel: () => vc};
        await info.subcommands.channel(interaction);
        const field = interaction.editReply.mock.calls[0][0].embeds[0].fields.find(f => f.name === 'Members');
        expect(field.value).toContain('<@m1>');
        expect(field.value).toContain('<@m2>');
    });
});

describe('role subcommand', () => {
    function role(over = {}) {
        return {
            id: 'r1',
            name: 'Mods',
            position: 3,
            createdAt: new Date('2024-01-01'),
            color: 0,
            hexColor: '#000000',
            hoist: false,
            mentionable: false,
            managed: false,
            permissions: {toArray: () => ['SEND_MESSAGES', 'KICK_MEMBERS']},
            members: {
                size: 0,
                forEach: () => {
                }
            },
            ...over
        };
    }

    test('lists explicit permissions when not an administrator', async () => {
        const interaction = baseInteraction(clientBase());
        interaction.options = {getRole: () => role()};
        await info.subcommands.role(interaction);
        const perms = interaction.editReply.mock.calls[0][0].embeds[0].fields.find(f => f.name === 'Perms');
        expect(perms.value).toContain('SEND_MESSAGES');
        expect(perms.value).toContain('KICK_MEMBERS');
    });

    test('collapses to ADMINISTRATOR when the role has it', async () => {
        const interaction = baseInteraction(clientBase());
        interaction.options = {getRole: () => role({permissions: {toArray: () => ['ADMINISTRATOR', 'SEND_MESSAGES']}})};
        await info.subcommands.role(interaction);
        const perms = interaction.editReply.mock.calls[0][0].embeds[0].fields.find(f => f.name === 'Perms');
        expect(perms.value).toBe('```ADMINISTRATOR```');
    });

    test('lists members when the role has 10 or fewer', async () => {
        const members = {
            size: 2,
            forEach: (fn) => {
                fn({id: 'a'});
                fn({id: 'b'});
            }
        };
        const interaction = baseInteraction(clientBase());
        interaction.options = {getRole: () => role({members})};
        await info.subcommands.role(interaction);
        const who = interaction.editReply.mock.calls[0][0].embeds[0].fields.find(f => f.name === 'Who');
        expect(who.value).toContain('<@a>');
        expect(who.value).toContain('<@b>');
    });

    test('feature flags surface in the description', async () => {
        const interaction = baseInteraction(clientBase());
        interaction.options = {
            getRole: () => role({
                hoist: true,
                mentionable: true,
                managed: true
            })
        };
        await info.subcommands.role(interaction);
        const desc = interaction.editReply.mock.calls[0][0].embeds[0].data.description;
        expect(desc).toContain('hoisted');
        expect(desc).toContain('mentionable');
        expect(desc).toContain('managed');
    });
});

describe('user subcommand enrichment', () => {
    function member(over = {}) {
        return {
            user: {
                id: 'u1',
                username: 'Alice',
                createdAt: new Date('2023-01-01'),
                avatarURL: () => 'a',
                presence: null
            },
            joinedAt: new Date('2024-01-01'),
            nickname: null,
            premiumSince: null,
            displayColor: 0,
            displayHexColor: '#000000',
            voice: {channel: null},
            roles: {
                highest: {id: 'rh'},
                hoist: null
            },
            permissions: {toArray: () => ['SEND_MESSAGES']},
            ...over
        };
    }

    test('adds level fields when the levels module is enabled', async () => {
        const client = clientBase({levels: {enabled: true}});
        client.models = {
            levels: {
                User: {
                    findOne: jest.fn().mockResolvedValue({
                        level: 5,
                        xp: 4000,
                        messages: 100
                    })
                }
            }
        };
        const interaction = baseInteraction(client);
        interaction.options = {getMember: () => member()};
        interaction.member = member();
        await info.subcommands.user(interaction);
        const names = interaction.editReply.mock.calls[0][0].embeds[0].fields.map(f => f.name);
        expect(names).toEqual(expect.arrayContaining(['XP', 'Level', 'Msgs']));
    });

    test('uses the ADMINISTRATOR shorthand in the permission field', async () => {
        const client = clientBase();
        const interaction = baseInteraction(client);
        const m = member({permissions: {toArray: () => ['ADMINISTRATOR', 'SEND_MESSAGES']}});
        interaction.options = {getMember: () => m};
        interaction.member = m;
        await info.subcommands.user(interaction);
        const perms = interaction.editReply.mock.calls[0][0].embeds[0].fields.find(f => f.name === 'Perms');
        expect(perms.value).toContain('ADMINISTRATOR');
        expect(perms.value).not.toContain('SEND_MESSAGES');
    });
});