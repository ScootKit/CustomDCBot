/*
 * Regression test for the 'Black' colour fix in the discord.js compat shim.
 *
 * The staff-management "ended" LOA/RA status DM builds its embed with
 * color: 'Black'. discord.js v14's Colors enum has no `Black`, so before the
 * fix setColor('Black') threw "Invalid color" at runtime and the member was
 * never told their status had ended. The shim (which main.js loads as the
 * production colour layer) now resolves 'Black' to pure black.
 */
require('../../src/discordjs-fix');
const {MessageEmbed} = require('discord.js');

describe('discord.js-fix resolves \'Black\'', () => {
    test('setColor(\'Black\') resolves to 0x000000 instead of throwing', () => {
        const embed = new MessageEmbed();
        expect(() => embed.setColor('Black')).not.toThrow();
        expect(embed.data.color).toBe(0x000000);
    });

    test('resolution is case-insensitive', () => {
        expect(new MessageEmbed().setColor('black').data.color).toBe(0x000000);
        expect(new MessageEmbed().setColor('BLACK').data.color).toBe(0x000000);
    });

    test('the previously-working named colours still resolve', () => {
        // Guard against the lookup-table edit regressing neighbouring entries.
        expect(new MessageEmbed().setColor('RED').data.color).toBe(0xE74C3C);
        expect(new MessageEmbed().setColor('NOT_QUITE_BLACK').data.color).toBe(0x23272A);
    });
});