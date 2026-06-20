/*
 * Tests for the /stealemote command (modules/admin-tools/commands/stealemote.js).
 *
 * Parses a "<:name:id>" / "<a:name:id>" emote string into name + cdn URL and
 * creates it on the guild. Covers:
 *  - the validation guard that rejects strings without both a name and an id
 *  - the happy path: the cdn attachment URL + name + audit reason passed to
 *    emojis.create, and the success reply
 *  - animated emotes (leading 'a:') currently fail the strict 3-part parse
 */

const emote = require('../../modules/admin-tools/commands/stealemote');

function makeInteraction(emoteString) {
    const created = {toString: () => ':imported:'};
    return {
        options: {getString: () => emoteString},
        user: {
            username: 'admin',
            discriminator: '0001',
            globalName: null
        },
        guild: {emojis: {create: jest.fn().mockResolvedValue(created)}},
        reply: jest.fn().mockResolvedValue()
    };
}

describe('run', () => {
    test('imports a standard custom emote with the right cdn URL and name', async () => {
        const i = makeInteraction('<:smile:123456789>');
        await emote.run(i);
        expect(i.guild.emojis.create).toHaveBeenCalledWith(expect.objectContaining({
            attachment: 'https://cdn.discordapp.com/emojis/123456789',
            name: 'smile'
        }));
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('emoji-import')}));
    });

    test('rejects a plain string with no colons (missing name/id)', async () => {
        const i = makeInteraction('justtext');
        await emote.run(i);
        expect(i.guild.emojis.create).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('emoji-too-much-data')}));
    });

    test('rejects a string with a name but no id', async () => {
        const i = makeInteraction('<:smile:>');
        await emote.run(i);
        expect(i.guild.emojis.create).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('emoji-too-much-data')}));
    });

    test('the audit reason references the importing user', async () => {
        const i = makeInteraction('<:wave:999>');
        await emote.run(i);
        expect(i.guild.emojis.create.mock.calls[0][0].reason).toContain('admin');
    });
});

describe('config', () => {
    test('requires MANAGE_EMOJIS_AND_STICKERS and a required emote option', () => {
        expect(emote.config.defaultMemberPermissions).toContain('MANAGE_EMOJIS_AND_STICKERS');
        const opt = emote.config.options.find(o => o.name === 'emote');
        expect(opt.required).toBe(true);
    });
});