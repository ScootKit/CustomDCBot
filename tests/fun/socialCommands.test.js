/*
 * Tests for the fun module's social commands (hug, kiss, pat, slap). They share
 * one behaviour: targeting yourself is rejected with an ephemeral reply and no
 * deferral; targeting someone else defers first, then editReplies with an image
 * attachment chosen from the configured pool. We assert the self-target guard,
 * the defer-before-editReply ordering, that reply() is NOT used on the happy
 * path, and that the chosen image comes from the configured list.
 */
const hug = require('../../modules/fun/commands/hug');
const kiss = require('../../modules/fun/commands/kiss');
const pat = require('../../modules/fun/commands/pat');
const slap = require('../../modules/fun/commands/slap');

const COMMANDS = [
    {
        name: 'hug',
        mod: hug,
        images: ['hug1.gif', 'hug2.gif'],
        cfgKey: 'hugImages',
        msgKey: 'hugMessage'
    },
    {
        name: 'kiss',
        mod: kiss,
        images: ['kiss1.gif'],
        cfgKey: 'kissImages',
        msgKey: 'kissMessage'
    },
    {
        name: 'pat',
        mod: pat,
        images: ['pat1.gif', 'pat2.gif'],
        cfgKey: 'patImages',
        msgKey: 'patMessage'
    },
    {
        name: 'slap',
        mod: slap,
        images: ['slap1.gif'],
        cfgKey: 'slapImages',
        msgKey: 'slapMessage'
    }
];

function makeInteraction(targetUser, cfg) {
    return {
        user: {id: 'author'},
        client: {configurations: {fun: {config: cfg}}},
        options: {getUser: jest.fn().mockReturnValue(targetUser)},
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe.each(COMMANDS)('$name command', ({
                                              mod,
                                              images,
                                              cfgKey,
                                              msgKey
                                          }) => {
    const cfg = {
        [cfgKey]: images,
        [msgKey]: 'the-message'
    };

    test('rejects targeting yourself with an ephemeral reply and no deferral', async () => {
        const interaction = makeInteraction({id: 'author'}, cfg);
        await mod.run(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(interaction.editReply).not.toHaveBeenCalled();
    });

    test('defers before editReply when targeting someone else', async () => {
        const interaction = makeInteraction({id: 'target'}, cfg);
        await mod.run(interaction);
        expect(interaction.deferReply).toHaveBeenCalledTimes(1);
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        expect(interaction.reply).not.toHaveBeenCalled();
        const deferOrder = interaction.deferReply.mock.invocationCallOrder[0];
        expect(interaction.editReply.mock.invocationCallOrder[0]).toBeGreaterThan(deferOrder);
    });

    test('attaches an image drawn from the configured pool', async () => {
        const interaction = makeInteraction({id: 'target'}, cfg);
        await mod.run(interaction);
        const payload = interaction.editReply.mock.calls[0][0];
        expect(payload.files).toHaveLength(1);
        // The attachment wraps one of the configured image URLs.
        const attachment = payload.files[0];
        const serialized = JSON.stringify(attachment);
        expect(images.some(img => serialized.includes(img) || attachment.attachment === img)).toBe(true);
    });
});