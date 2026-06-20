/*
 * Tests for legacyChannelType in modules/info-commands/commands/info.js, which
 * maps discord.js v14 numeric ChannelType values back to the v13 string names
 * the /info channel embed localizes against. Also covers the passthrough for
 * already-string inputs and the beforeSubcommand defer, plus the user-not-found
 * branch of the user subcommand.
 */

const {ChannelType} = require('discord.js');
const info = require('../../modules/info-commands/commands/info');
const {legacyChannelType} = info;

describe('legacyChannelType', () => {
    test('maps text/voice/category numeric types', () => {
        expect(legacyChannelType(ChannelType.GuildText)).toBe('GUILD_TEXT');
        expect(legacyChannelType(ChannelType.GuildVoice)).toBe('GUILD_VOICE');
        expect(legacyChannelType(ChannelType.GuildCategory)).toBe('GUILD_CATEGORY');
    });

    test('maps announcement and thread types', () => {
        expect(legacyChannelType(ChannelType.GuildAnnouncement)).toBe('GUILD_NEWS');
        expect(legacyChannelType(ChannelType.PublicThread)).toBe('PUBLIC_THREAD');
        expect(legacyChannelType(ChannelType.PrivateThread)).toBe('PRIVATE_THREAD');
        expect(legacyChannelType(ChannelType.AnnouncementThread)).toBe('NEWS_THREAD');
    });

    test('maps forum, media and stage types', () => {
        expect(legacyChannelType(ChannelType.GuildForum)).toBe('GUILD_FORUM');
        expect(legacyChannelType(ChannelType.GuildMedia)).toBe('GUILD_MEDIA');
        expect(legacyChannelType(ChannelType.GuildStageVoice)).toBe('GUILD_STAGE_VOICE');
    });

    test('passes through values that are already strings', () => {
        expect(legacyChannelType('GUILD_TEXT')).toBe('GUILD_TEXT');
    });
});

describe('beforeSubcommand', () => {
    test('defers the reply ephemerally', async () => {
        const interaction = {deferReply: jest.fn().mockResolvedValue()};
        await info.beforeSubcommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
    });
});

describe('user subcommand - not found', () => {
    test('replies with user_not_found when no member resolves', async () => {
        const interaction = {
            client: {configurations: {'info-commands': {strings: {user_not_found: 'no-user'}}}},
            options: {getMember: () => null},
            member: null,
            reply: jest.fn().mockResolvedValue()
        };
        await info.subcommands.user(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toBe('no-user');
    });
});
