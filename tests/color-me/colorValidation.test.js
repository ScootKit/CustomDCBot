/*
 * Covers the colour-validation helper extracted from modules/color-me/commands/
 * color-me.js. Verifies hex normalisation (prefixing '#'), strict 6-digit hex
 * validation with the cancel/editReply path on bad input, and the default
 * gold colour when no colour option is supplied. embedType output isn't
 * asserted (it's a real helper); we assert the {roleColor, cancel} contract and
 * whether the user was warned. main/localize are auto-stubbed by jest.config.
 */
const {color} = require('../../modules/color-me/commands/color-me');

function makeInteraction() {
    return {
        editReply: jest.fn().mockResolvedValue()
    };
}

const strings = {invalidColor: 'invalid'};

test('returns default gold colour and no cancel when no colour is given', async () => {
    const interaction = makeInteraction();
    const result = await color(null, interaction, strings);
    expect(result).toEqual({
        roleColor: 0x000000,
        cancel: false
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
});

test('accepts a valid hex with leading #', async () => {
    const interaction = makeInteraction();
    const result = await color('#1A2B3C', interaction, strings);
    expect(result).toEqual({
        roleColor: '#1A2B3C',
        cancel: false
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
});

test('prefixes a missing # before validating', async () => {
    const interaction = makeInteraction();
    const result = await color('ABCDEF', interaction, strings);
    expect(result.roleColor).toBe('#ABCDEF');
    expect(result.cancel).toBe(false);
});

test('accepts lowercase hex (case-insensitive)', async () => {
    const result = await color('abcdef', makeInteraction(), strings);
    expect(result).toEqual({
        roleColor: '#abcdef',
        cancel: false
    });
});

test('rejects a 3-digit hex shorthand and warns the user', async () => {
    const interaction = makeInteraction();
    const result = await color('#FFF', interaction, strings);
    expect(result.cancel).toBe(true);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
});

test('rejects hex containing non-hex characters', async () => {
    const interaction = makeInteraction();
    const result = await color('GGGGGG', interaction, strings);
    expect(result.cancel).toBe(true);
    expect(result.roleColor).toBe('#GGGGGG');
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
});

test('rejects an over-long hex value', async () => {
    const interaction = makeInteraction();
    const result = await color('#1234567', interaction, strings);
    expect(result.cancel).toBe(true);
});
