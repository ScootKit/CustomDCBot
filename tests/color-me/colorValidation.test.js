/*
 * Covers the colour-validation helper extracted from modules/color-me/commands/
 * color-me.js. Verifies hex normalisation (prefixing '#'), strict 6-digit hex
 * validation with the cancel/editReply path on bad input, and the default
 * gold colour when no colour option is supplied. embedType output isn't
 * asserted (it's a real helper); we assert the {roleColor, cancel} contract and
 * whether the user was warned. main/localize are auto-stubbed by jest.config.
 */
const {color} = require('../../modules/color-me/commands/color-me');

function makeInteraction(colorOption) {
    return {
        options: {getString: (name) => (name === 'color' ? colorOption : null)},
        editReply: jest.fn().mockResolvedValue()
    };
}

const strings = {invalidColor: 'invalid'};

test('returns default gold colour and no cancel when no colour is given', async () => {
    const interaction = makeInteraction(null);
    const result = await color(interaction, strings);
    expect(result).toEqual({
        roleColor: 0xF1C40F,
        cancel: false
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
});

test('accepts a valid hex with leading #', async () => {
    const interaction = makeInteraction('#1A2B3C');
    const result = await color(interaction, strings);
    expect(result).toEqual({
        roleColor: '#1A2B3C',
        cancel: false
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
});

test('prefixes a missing # before validating', async () => {
    const interaction = makeInteraction('ABCDEF');
    const result = await color(interaction, strings);
    expect(result.roleColor).toBe('#ABCDEF');
    expect(result.cancel).toBe(false);
});

test('accepts lowercase hex (case-insensitive)', async () => {
    const result = await color(makeInteraction('abcdef'), strings);
    expect(result).toEqual({
        roleColor: '#abcdef',
        cancel: false
    });
});

test('rejects a 3-digit hex shorthand and warns the user', async () => {
    const interaction = makeInteraction('#FFF');
    const result = await color(interaction, strings);
    expect(result.cancel).toBe(true);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
});

test('rejects hex containing non-hex characters', async () => {
    const interaction = makeInteraction('GGGGGG');
    const result = await color(interaction, strings);
    expect(result.cancel).toBe(true);
    expect(result.roleColor).toBe('#GGGGGG');
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
});

test('rejects an over-long hex value', async () => {
    const interaction = makeInteraction('#1234567');
    const result = await color(interaction, strings);
    expect(result.cancel).toBe(true);
});