/*
 * Tests for src/discordjs-fix.js — the compat shim that backports v13-era
 * discord.js aliases and string-based enums onto v14 builders. The shim is
 * loaded by jest's setupFiles, so it is already applied in-process here.
 */

const Discord = require('discord.js');

describe('discordjs-fix - legacy class aliases', () => {
    test('MessageEmbed aliases EmbedBuilder', () => {
        expect(Discord.MessageEmbed).toBe(Discord.EmbedBuilder);
    });

    test('MessageAttachment aliases AttachmentBuilder', () => {
        expect(Discord.MessageAttachment).toBe(Discord.AttachmentBuilder);
    });

    test('MessageActionRow aliases ActionRowBuilder', () => {
        expect(Discord.MessageActionRow).toBe(Discord.ActionRowBuilder);
    });

    test('MessageButton aliases ButtonBuilder', () => {
        expect(Discord.MessageButton).toBe(Discord.ButtonBuilder);
    });

    test('MessageSelectMenu aliases StringSelectMenuBuilder', () => {
        expect(Discord.MessageSelectMenu).toBe(Discord.StringSelectMenuBuilder);
    });

    test('TextInputComponent aliases TextInputBuilder', () => {
        expect(Discord.TextInputComponent).toBe(Discord.TextInputBuilder);
    });

    test('Modal aliases ModalBuilder', () => {
        expect(Discord.Modal).toBe(Discord.ModalBuilder);
    });

    test('Permissions aliases PermissionsBitField', () => {
        expect(Discord.Permissions).toBe(Discord.PermissionsBitField);
    });

    test('Intents.FLAGS aliases GatewayIntentBits', () => {
        expect(Discord.Intents.FLAGS).toBe(Discord.GatewayIntentBits);
    });

    test('Partials alias is present', () => {
        expect(Discord.Partials).toBeDefined();
    });
});

describe('discordjs-fix - EmbedBuilder.addField backport', () => {
    test('addField exists on the prototype', () => {
        expect(typeof Discord.EmbedBuilder.prototype.addField).toBe('function');
    });

    test('addField appends a single field', () => {
        const embed = new Discord.MessageEmbed().addField('Name', 'Value');
        expect(embed.data.fields).toEqual([
            {
                name: 'Name',
                value: 'Value',
                inline: false
            }
        ]);
    });

    test('addField honours the inline argument', () => {
        const embed = new Discord.MessageEmbed().addField('n', 'v', true);
        expect(embed.data.fields[0].inline).toBe(true);
    });

    test('addField is chainable', () => {
        const embed = new Discord.MessageEmbed();
        expect(embed.addField('a', 'b')).toBe(embed);
    });

    test('addField substitutes zero-width space for empty name/value', () => {
        const embed = new Discord.MessageEmbed().addField('', '');
        expect(embed.data.fields[0].name).toBe('​');
        expect(embed.data.fields[0].value).toBe('​');
    });
});

describe('discordjs-fix - addFields normalization', () => {
    test('replaces empty name/value with zero-width space', () => {
        const embed = new Discord.EmbedBuilder().addFields({
            name: '',
            value: ''
        });
        expect(embed.data.fields[0].name).toBe('​');
        expect(embed.data.fields[0].value).toBe('​');
    });

    test('preserves provided name/value', () => {
        const embed = new Discord.EmbedBuilder().addFields({
            name: 'X',
            value: 'Y'
        });
        expect(embed.data.fields[0]).toMatchObject({
            name: 'X',
            value: 'Y'
        });
    });

    test('flattens an array argument of fields', () => {
        const embed = new Discord.EmbedBuilder().addFields([
            {
                name: 'A',
                value: '1'
            },
            {
                name: 'B',
                value: '2'
            }
        ]);
        expect(embed.data.fields.map(f => f.name)).toEqual(['A', 'B']);
    });

    test('accepts multiple field arguments', () => {
        const embed = new Discord.EmbedBuilder().addFields(
            {
                name: 'A',
                value: '1'
            },
            {
                name: 'B',
                value: '2'
            }
        );
        expect(embed.data.fields).toHaveLength(2);
    });
});

describe('discordjs-fix - setDescription empty string handling', () => {
    test('empty string description is dropped (treated as null)', () => {
        const embed = new Discord.EmbedBuilder().setDescription('');
        expect(embed.data.description).toBeUndefined();
    });

    test('non-empty description is preserved', () => {
        const embed = new Discord.EmbedBuilder().setDescription('hi');
        expect(embed.data.description).toBe('hi');
    });
});

describe('discordjs-fix - setColor resolution', () => {
    test('resolves named color RED to its int', () => {
        const embed = new Discord.EmbedBuilder().setColor('RED');
        expect(embed.data.color).toBe(0xE74C3C);
    });

    test('resolves named color GREEN to its int', () => {
        const embed = new Discord.EmbedBuilder().setColor('GREEN');
        expect(embed.data.color).toBe(0x2ECC71);
    });

    test('resolves named color case-insensitively', () => {
        const embed = new Discord.EmbedBuilder().setColor('red');
        expect(embed.data.color).toBe(0xE74C3C);
    });

    test('resolves a #-prefixed hex string', () => {
        const embed = new Discord.EmbedBuilder().setColor('#ff0000');
        expect(embed.data.color).toBe(0xff0000);
    });

    test('passes numeric colors through unchanged', () => {
        const embed = new Discord.EmbedBuilder().setColor(0x123456);
        expect(embed.data.color).toBe(0x123456);
    });

    test('resolves BLURPLE named color', () => {
        const embed = new Discord.EmbedBuilder().setColor('BLURPLE');
        expect(embed.data.color).toBe(0x5865F2);
    });
});

describe('discordjs-fix - ButtonBuilder.setStyle string enums', () => {
    test('PRIMARY maps to ButtonStyle.Primary', () => {
        const btn = new Discord.ButtonBuilder().setCustomId('x').setLabel('y').setStyle('PRIMARY');
        expect(btn.data.style).toBe(Discord.ButtonStyle.Primary);
    });

    test('SECONDARY maps to ButtonStyle.Secondary', () => {
        const btn = new Discord.ButtonBuilder().setCustomId('x').setLabel('y').setStyle('SECONDARY');
        expect(btn.data.style).toBe(Discord.ButtonStyle.Secondary);
    });

    test('DANGER maps to ButtonStyle.Danger', () => {
        const btn = new Discord.ButtonBuilder().setCustomId('x').setLabel('y').setStyle('DANGER');
        expect(btn.data.style).toBe(Discord.ButtonStyle.Danger);
    });

    test('LINK maps to ButtonStyle.Link', () => {
        const btn = new Discord.ButtonBuilder().setURL('https://x').setLabel('y').setStyle('LINK');
        expect(btn.data.style).toBe(Discord.ButtonStyle.Link);
    });

    test('numeric style passes through unchanged', () => {
        const btn = new Discord.ButtonBuilder().setCustomId('x').setLabel('y').setStyle(Discord.ButtonStyle.Success);
        expect(btn.data.style).toBe(Discord.ButtonStyle.Success);
    });

    test('lowercase string style is normalized', () => {
        const btn = new Discord.ButtonBuilder().setCustomId('x').setLabel('y').setStyle('primary');
        expect(btn.data.style).toBe(Discord.ButtonStyle.Primary);
    });
});

describe('discordjs-fix - TextInputBuilder.setStyle string enums', () => {
    test('SHORT maps to TextInputStyle.Short', () => {
        const ti = new Discord.TextInputBuilder().setCustomId('x').setLabel('y').setStyle('SHORT');
        expect(ti.data.style).toBe(Discord.TextInputStyle.Short);
    });

    test('PARAGRAPH maps to TextInputStyle.Paragraph', () => {
        const ti = new Discord.TextInputBuilder().setCustomId('x').setLabel('y').setStyle('PARAGRAPH');
        expect(ti.data.style).toBe(Discord.TextInputStyle.Paragraph);
    });

    test('numeric style passes through unchanged', () => {
        const ti = new Discord.TextInputBuilder().setCustomId('x').setLabel('y').setStyle(Discord.TextInputStyle.Paragraph);
        expect(ti.data.style).toBe(Discord.TextInputStyle.Paragraph);
    });
});

describe('discordjs-fix - PermissionsBitField.resolve string names', () => {
    test('resolves SCREAMING_SNAKE permission name', () => {
        const resolved = Discord.PermissionsBitField.resolve('SEND_MESSAGES');
        expect(resolved).toBe(Discord.PermissionFlagsBits.SendMessages);
    });

    test('resolves MANAGE_CHANNELS', () => {
        const resolved = Discord.PermissionsBitField.resolve('MANAGE_CHANNELS');
        expect(resolved).toBe(Discord.PermissionFlagsBits.ManageChannels);
    });

    test('resolves ADMINISTRATOR', () => {
        const resolved = Discord.PermissionsBitField.resolve('ADMINISTRATOR');
        expect(resolved).toBe(Discord.PermissionFlagsBits.Administrator);
    });

    test('resolves an already-bigint permission unchanged', () => {
        const bit = Discord.PermissionFlagsBits.SendMessages;
        expect(Discord.PermissionsBitField.resolve(bit)).toBe(bit);
    });

    test('resolves a multi-word permission via PascalCase fallback', () => {
        const resolved = Discord.PermissionsBitField.resolve('VIEW_CHANNEL');
        expect(resolved).toBe(Discord.PermissionFlagsBits.ViewChannel);
    });
});

describe('discordjs-fix - BaseInteraction.isSelectMenu backport', () => {
    const proto = Discord.BaseInteraction.prototype;

    test('isSelectMenu is callable, alongside the modern isStringSelectMenu', () => {
        // The shim guarantees legacy module code that calls
        // interaction.isSelectMenu() keeps working. On discord.js v14 the method
        // is native (deprecated); the shim only backports it on builds where it
        // is absent (its `if (!...isSelectMenu)` guard). Either way both the
        // legacy and modern predicates must be present and callable.
        expect(typeof proto.isSelectMenu).toBe('function');
        expect(typeof proto.isStringSelectMenu).toBe('function');
    });

    test('a real string-select interaction reports isStringSelectMenu() === true', () => {
        // Functional check against the live discord.js predicate the shim relies on.
        const fake = {
            type: Discord.InteractionType.MessageComponent,
            componentType: Discord.ComponentType.StringSelect
        };
        expect(proto.isStringSelectMenu.call(fake)).toBe(true);
        const button = {
            type: Discord.InteractionType.MessageComponent,
            componentType: Discord.ComponentType.Button
        };
        expect(proto.isStringSelectMenu.call(button)).toBe(false);
    });
});

describe('discordjs-fix - Guild.me getter backport', () => {
    test('Guild.prototype has a "me" accessor', () => {
        const desc = Object.getOwnPropertyDescriptor(Discord.Guild.prototype, 'me');
        expect(desc).toBeDefined();
        expect(typeof desc.get).toBe('function');
    });

    test('me getter returns members.me', () => {
        const fake = {members: {me: {id: 'bot'}}};
        const getter = Object.getOwnPropertyDescriptor(Discord.Guild.prototype, 'me').get;
        expect(getter.call(fake)).toEqual({id: 'bot'});
    });
});

describe('discordjs-fix - module identity', () => {
    test('module.exports is the same Discord namespace object', () => {
        expect(require('discord.js')).toBe(Discord);
    });

    test('require cache for discord.js points at the patched namespace', () => {
        const cached = require.cache[require.resolve('discord.js')].exports;
        expect(cached).toBe(Discord);
    });
});