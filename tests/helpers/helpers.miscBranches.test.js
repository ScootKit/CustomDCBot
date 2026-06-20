/*
 * Remaining branch coverage: safeSetFooter iconURL override, getGlobalArgs avatar/guild-icon
 * fallbacks, formatDiscordUserName tag-vs-fallback nuances, embedTypeV2 non-scnx passthrough,
 * and direct invocation of the __test.embedTypeSchemaV2 / embedTypeSchemaV4 internals.
 */
const mainStub = require('../__stubs__/main');
const helpers = require('../../src/functions/helpers');
const {__test} = helpers;
const {
    MessageEmbed,
    MessageFlags
} = require('discord.js');

beforeEach(() => {
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
});

describe('safeSetFooter (more branches)', () => {
    test('customIconURL overrides client.strings.footerImgUrl', () => {
        const client = {
            strings: {
                footer: 'F',
                footerImgUrl: 'https://default/i.png'
            }
        };
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, client, null, 'https://custom/i.png');
        expect(embed.data.footer.icon_url).toBe('https://custom/i.png');
    });

    test('custom text with custom icon both apply', () => {
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, {strings: {}}, 'hi', 'https://x/i.png');
        expect(embed.data.footer).toEqual({
            text: 'hi',
            icon_url: 'https://x/i.png'
        });
    });

    test('footer with text but no icon stores null icon_url', () => {
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, {strings: {footer: 'only text'}});
        expect(embed.data.footer.text).toBe('only text');
        expect(embed.data.footer.icon_url).toBeNull();
    });

    test('whitespace-only custom text wins precedence but is rejected by trim check (no footer set)', () => {
        // customText '   ' is truthy so it is selected over the client footer, then the
        // trim().length>0 guard rejects it, leaving no footer at all.
        const client = {strings: {footer: 'fallback'}};
        const embed = new MessageEmbed();
        helpers.safeSetFooter(embed, client, '   ');
        expect(embed.data.footer).toBeUndefined();
    });
});

describe('getGlobalArgs (avatar/guild fallbacks)', () => {
    test('empty displayAvatarURL yields empty %botAvatar%', () => {
        mainStub.client.user = {
            id: 'b',
            tag: 'b#0',
            username: 'u',
            displayName: 'u',
            displayAvatarURL: () => '',
            toString: () => '<@b>'
        };
        expect(__test.getGlobalArgs()['%botAvatar%']).toBe('');
    });

    test('guild with empty iconURL yields empty %guildIcon%', () => {
        mainStub.client.user = {
            id: 'b',
            tag: 'b#0',
            username: 'u',
            displayName: 'u',
            displayAvatarURL: () => 'a',
            toString: () => '<@b>'
        };
        mainStub.client.guild = {
            id: 'g',
            name: 'G',
            iconURL: () => ''
        };
        expect(__test.getGlobalArgs()['%guildIcon%']).toBe('');
    });

    test('returns empty object when client.user is undefined', () => {
        mainStub.client.user = undefined;
        expect(__test.getGlobalArgs()).toEqual({});
    });
});

describe('formatDiscordUserName (more nuances)', () => {
    test('legacy user with tag prefers tag over reconstruction', () => {
        expect(helpers.formatDiscordUserName({
            discriminator: '9999',
            username: 'name',
            tag: 'Pretty#9999'
        })).toBe('Pretty#9999');
    });

    test('new-style user without addAtToUsernames setting omits @', () => {
        mainStub.client.strings = {};
        expect(helpers.formatDiscordUserName({
            discriminator: '0',
            username: 'plain'
        })).toBe('plain');
    });

    test('new-style user with addAtToUsernames false omits @', () => {
        mainStub.client.strings = {addAtToUsernames: false};
        expect(helpers.formatDiscordUserName({
            discriminator: '0',
            username: 'plain'
        })).toBe('plain');
    });
});

describe('embedTypeV2 non-scnx passthrough', () => {
    test('without scnxSetup returns embedType result directly', async () => {
        mainStub.client.scnxSetup = false;
        const out = await helpers.embedTypeV2({
            _schema: 'v2',
            title: 'Plain'
        }, {}, {});
        expect(out.embeds[0].data.title).toBe('Plain');
    });

    test('string input passes through the wrapper', async () => {
        const out = await helpers.embedTypeV2('hi %who%', {'%who%': 'there'}, {});
        expect(out.content).toBe('hi there');
    });
});

describe('__test.embedTypeSchemaV2 (direct)', () => {
    test('builds an embed from a title-only input', () => {
        const out = __test.embedTypeSchemaV2({title: 'Direct'}, {}, {});
        expect(out.embeds[0].data.title).toBe('Direct');
    });

    test('content comes from the "message" field', () => {
        const out = __test.embedTypeSchemaV2({
            title: 'T',
            message: 'body'
        }, {}, {});
        expect(out.content).toBe('body');
    });

    test('no message field yields null content', () => {
        const out = __test.embedTypeSchemaV2({title: 'T'}, {}, {});
        expect(out.content).toBeNull();
    });

    test('embedTimestamp overrides the auto timestamp', () => {
        const ts = new Date(1700000000_000);
        const out = __test.embedTypeSchemaV2({
            title: 'T',
            embedTimestamp: ts
        }, {}, {});
        expect(new Date(out.embeds[0].data.timestamp).getTime()).toBe(ts.getTime());
    });
});

describe('__test.embedTypeSchemaV4 (direct)', () => {
    test('sets the IsComponentsV2 flag', () => {
        const out = __test.embedTypeSchemaV4({components: []}, {}, {});
        expect(out.flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
    });

    test('always nulls content and empties embeds', () => {
        const out = __test.embedTypeSchemaV4({
            components: [{
                type: 10,
                content: 'x'
            }]
        }, {}, {});
        expect(out.content).toBeNull();
        expect(out.embeds).toEqual([]);
    });

    test('preserves a pre-existing numeric flag via OR', () => {
        const out = __test.embedTypeSchemaV4({components: []}, {}, {flags: 4});
        expect(out.flags & 4).toBe(4);
        expect(out.flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
    });
});