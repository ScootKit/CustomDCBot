const mainStub = require('../__stubs__/main');
const helpers = require('../../src/functions/helpers');
const {__test} = helpers;
const {MessageEmbed} = require('discord.js');

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
    mainStub.client.bcp47Locale = 'en-US';
}

beforeEach(resetClient);

describe('safeSetFooter', () => {
    test('uses client.strings.footer when no custom text provided', () => {
        const client = {
            strings: {
                footer: 'default footer',
                footerImgUrl: 'https://x/i.png'
            }
        };
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, client);
        expect(embed.data.footer).toEqual({
            text: 'default footer',
            icon_url: 'https://x/i.png'
        });
    });

    test('customText overrides client.strings.footer', () => {
        const client = {strings: {footer: 'default'}};
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, client, 'custom!');
        expect(embed.data.footer.text).toBe('custom!');
    });

    test('skips footer when both custom and client text are empty/whitespace', () => {
        const client = {strings: {footer: '   '}};
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, client);
        expect(embed.data.footer).toBeUndefined();
    });

    test('skips footer when client.strings is absent and no custom text', () => {
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, {});
        expect(embed.data.footer).toBeUndefined();
    });

    test('returns the embed for chaining', () => {
        const client = {strings: {footer: 'x'}};
        const embed = new MessageEmbed();
        expect(helpers.safeSetFooter(embed, client)).toBe(embed);
    });
});

describe('getGlobalArgs (internal)', () => {
    test('returns empty object when client.user is null', () => {
        expect(__test.getGlobalArgs()).toEqual({});
    });

    test('includes bot variables when client.user is set', () => {
        mainStub.client.user = {
            id: 'bot-1',
            tag: 'Bot#0000',
            username: 'BotName',
            displayName: 'Bot Display',
            displayAvatarURL: () => 'https://x/avatar.png',
            toString: () => '<@bot-1>'
        };
        const args = __test.getGlobalArgs();
        expect(args['%botName%']).toBe('Bot Display');
        expect(args['%botID%']).toBe('bot-1');
        expect(args['%botAvatar%']).toBe('https://x/avatar.png');
        expect(args['%botTag%']).toBe('Bot#0000');
        expect(args['%botMention%']).toBe('<@bot-1>');
    });

    test('falls back to username when displayName missing', () => {
        mainStub.client.user = {
            id: 'b',
            tag: 'b#0',
            username: 'OnlyUsername',
            displayName: null,
            displayAvatarURL: () => '',
            toString: () => '<@b>'
        };
        expect(__test.getGlobalArgs()['%botName%']).toBe('OnlyUsername');
    });

    test('adds guild variables when client.guild is set', () => {
        mainStub.client.user = {
            id: 'b',
            tag: 'b#0',
            username: 'u',
            displayName: 'u',
            displayAvatarURL: () => '',
            toString: () => '<@b>'
        };
        mainStub.client.guild = {
            id: 'g-1',
            name: 'Test Guild',
            iconURL: () => 'https://x/g.png'
        };
        const args = __test.getGlobalArgs();
        expect(args['%guildID%']).toBe('g-1');
        expect(args['%guildName%']).toBe('Test Guild');
        expect(args['%guildIcon%']).toBe('https://x/g.png');
    });

    test('always emits all timestamp placeholders', () => {
        mainStub.client.user = {
            id: 'b',
            tag: 'b#0',
            username: 'u',
            displayName: 'u',
            displayAvatarURL: () => '',
            toString: () => '<@b>'
        };
        const args = __test.getGlobalArgs();
        for (const key of ['%timestamp%', '%shortTime%', '%longTime%', '%shortDate%', '%longDate%', '%shortDateTime%', '%longDateTime%', '%relativeTime%']) {
            expect(args[key]).toMatch(/^<t:\d+/);
        }
    });
});

describe('todayInServerTZ', () => {
    test('returns ISO date in YYYY-MM-DD format', () => {
        mainStub.client.config.timezone = 'UTC';
        expect(helpers.todayInServerTZ()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('honors the configured timezone', () => {
        // 2024-01-01 00:30 UTC = 2023-12-31 in America/Los_Angeles (UTC-8)
        const realDate = global.Date;
        global.Date = class extends realDate {
            constructor(...args) {
                if (args.length === 0) return new realDate('2024-01-01T00:30:00Z');
                return new realDate(...args);
            }

            static now() {
                return new realDate('2024-01-01T00:30:00Z').getTime();
            }
        };
        try {
            mainStub.client.config.timezone = 'America/Los_Angeles';
            expect(helpers.todayInServerTZ()).toBe('2023-12-31');
            mainStub.client.config.timezone = 'UTC';
            expect(helpers.todayInServerTZ()).toBe('2024-01-01');
        } finally {
            global.Date = realDate;
        }
    });
});

describe('formatDiscordUserName with addAtToUsernames', () => {
    test('prepends @ for new-style users when client setting enabled', () => {
        mainStub.client.strings.addAtToUsernames = true;
        expect(helpers.formatDiscordUserName({
            discriminator: '0',
            username: 'alice'
        })).toBe('@alice');
    });

    test('does not prepend @ for legacy discriminator users', () => {
        mainStub.client.strings.addAtToUsernames = true;
        expect(helpers.formatDiscordUserName({
            discriminator: '1234',
            username: 'alice',
            tag: 'alice#1234'
        })).toBe('alice#1234');
    });
});