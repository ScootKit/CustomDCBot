/*
 * Behavior tests for the temp-channels settings-message sender, the channelDelete
 * cleanup event, the slash command's beforeSubcommand gate / option builder, and the
 * interactionCreate button/modal/select router.
 *
 *  - sendMessage: builds the two-row settings button panel and either edits the
 *    tracked settings message or sends + persists a new one.
 *  - channelDelete: when a deleted channel maps to a TempChannel row it also deletes
 *    the partner (no-mic/main) channel and destroys the row; ignores unrelated channels.
 *  - command.beforeSubcommand: defers, sets interaction.cancel based on whether the
 *    caller owns the temp channel they're in.
 *  - interactionCreate: every button/modal/select branch replies notInChannel when the
 *    caller has no owned temp channel, and otherwise routes to the right settings fn.
 *
 * The DB client is the jest-mapped ../../main stub; embedType runs for real.
 */
const mainStub = require('../__stubs__/main');

describe('sendMessage', () => {
    const {sendMessage} = require('../../modules/temp-channels/channel-settings');

    function setup({existingMessageID = null} = {}) {
        const messageData = {
            messageID: existingMessageID,
            save: jest.fn().mockResolvedValue()
        };
        mainStub.client.configurations = {'temp-channels': {config: {settingsMessage: 'Settings'}}};
        mainStub.client.models = {
            'temp-channels': {
                SettingsMessage: {
                    findOrCreate: jest.fn().mockResolvedValue([messageData])
                }
            }
        };
        const editFn = jest.fn().mockResolvedValue();
        const channel = {
            id: 'c1',
            messages: {fetch: jest.fn().mockResolvedValue(existingMessageID ? {edit: editFn} : null)},
            send: jest.fn().mockResolvedValue({id: 'newmsg'})
        };
        return {
            messageData,
            channel,
            editFn
        };
    }

    test('sends a new panel and persists the message id when none exists', async () => {
        const {
            messageData,
            channel
        } = setup({existingMessageID: null});
        await sendMessage(channel);
        expect(channel.send).toHaveBeenCalled();
        const payload = channel.send.mock.calls[0][0];
        // two action rows with the six settings buttons
        expect(payload.components.length).toBe(2);
        expect(messageData.messageID).toBe('newmsg');
        expect(messageData.save).toHaveBeenCalled();
    });

    test('edits the existing settings message instead of sending', async () => {
        const {
            channel,
            editFn
        } = setup({existingMessageID: 'old'});
        await sendMessage(channel);
        expect(editFn).toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
    });
});

describe('channelDelete event', () => {
    const handler = require('../../modules/temp-channels/events/channelDelete');

    function makeClient(dbChannel, otherChannel) {
        return {
            botReadyAt: Date.now(),
            models: {'temp-channels': {TempChannel: {findOne: jest.fn().mockResolvedValue(dbChannel)}}},
            channels: {fetch: jest.fn().mockResolvedValue(otherChannel)}
        };
    }

    test('returns early when the bot is not ready', async () => {
        const client = makeClient(null, null);
        client.botReadyAt = null;
        await handler.run(client, {id: 'c1'});
        expect(client.models['temp-channels'].TempChannel.findOne).not.toHaveBeenCalled();
    });

    test('does nothing for a channel with no matching row', async () => {
        const client = makeClient(null, null);
        await handler.run(client, {id: 'c1'});
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('deletes the partner channel and destroys the row', async () => {
        const partnerDelete = jest.fn().mockResolvedValue();
        const dbChannel = {
            id: 'main',
            noMicChannel: 'nomic',
            destroy: jest.fn().mockResolvedValue()
        };
        const client = makeClient(dbChannel, {delete: partnerDelete});
        await handler.run(client, {id: 'main'});
        // partner = noMicChannel id
        expect(client.channels.fetch).toHaveBeenCalledWith('nomic');
        expect(partnerDelete).toHaveBeenCalled();
        expect(dbChannel.destroy).toHaveBeenCalled();
    });

    test('destroys the row even when the partner channel cannot be fetched', async () => {
        const dbChannel = {
            id: 'main',
            noMicChannel: null,
            destroy: jest.fn().mockResolvedValue()
        };
        const client = makeClient(dbChannel, undefined);
        await handler.run(client, {id: 'main'});
        expect(dbChannel.destroy).toHaveBeenCalled();
    });
});

describe('temp-channel command beforeSubcommand', () => {
    const command = require('../../modules/temp-channels/commands/temp-channel');

    function makeInteraction(vc) {
        mainStub.client.models = {'temp-channels': {TempChannel: {findOne: jest.fn().mockResolvedValue(vc)}}};
        return {
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue(),
            member: {
                id: 'creator',
                voice: {channelId: 'vc1'}
            },
            client: {configurations: {'temp-channels': {config: {notInChannel: 'not-in-channel'}}}}
        };
    }

    test('defers and cancels when the caller owns no temp channel', async () => {
        const interaction = makeInteraction(null);
        await command.beforeSubcommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(interaction.cancel).toBe(true);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'not-in-channel'}));
    });

    test('allows the subcommand when the caller owns the channel', async () => {
        const interaction = makeInteraction({id: 'vc1'});
        await command.beforeSubcommand(interaction);
        expect(interaction.cancel).toBe(false);
        expect(interaction.editReply).not.toHaveBeenCalled();
    });

    test('config.options exposes mode/add/remove/list only when allowUserToChangeMode is on', () => {
        mainStub.client.configurations = {
            'temp-channels': {
                config: {
                    allowUserToChangeMode: true,
                    allowUserToChangeName: false
                }
            }
        };
        const names = command.config.options().map(o => o.name);
        expect(names).toEqual(expect.arrayContaining(['mode', 'add-user', 'remove-user', 'list-users']));
        expect(names).not.toContain('edit');
    });

    test('config.options exposes edit only when allowUserToChangeName is on', () => {
        mainStub.client.configurations = {
            'temp-channels': {
                config: {
                    allowUserToChangeMode: false,
                    allowUserToChangeName: true
                }
            }
        };
        const names = command.config.options().map(o => o.name);
        expect(names).toEqual(['edit']);
    });

    test('subcommand handlers no-op when interaction.cancel is set', async () => {
        const interaction = {cancel: true};
        // none of these should throw despite missing channel-settings dependencies
        await command.subcommands.mode(interaction);
        await command.subcommands['add-user'](interaction);
        await command.subcommands['remove-user'](interaction);
        await command.subcommands['list-users'](interaction);
        await command.subcommands.edit(interaction);
    });
});

describe('interactionCreate router', () => {
    const handler = require('../../modules/temp-channels/events/interactionCreate');

    function baseInteraction(overrides = {}) {
        return {
            guild: {
                id: 'g1',
                channels: {
                    cache: {
                        get: () => ({
                            id: 'vc1',
                            nsfw: false,
                            bitrate: 64000,
                            userLimit: 0,
                            name: 'n'
                        })
                    }
                },
                maximumBitrate: 384000
            },
            member: {
                id: 'creator',
                voice: {channelId: 'vc1'}
            },
            client: {
                botReadyAt: Date.now(),
                config: {guildID: 'g1'},
                configurations: {'temp-channels': {config: {notInChannel: 'not-in-channel'}}},
                models: {'temp-channels': {TempChannel: {findOne: jest.fn()}}}
            },
            isButton: () => false,
            isModalSubmit: () => false,
            isUserSelectMenu: () => false,
            reply: jest.fn().mockResolvedValue(),
            deferReply: jest.fn().mockResolvedValue(),
            ...overrides
        };
    }

    test('returns early before the bot is ready', async () => {
        const interaction = baseInteraction();
        interaction.client.botReadyAt = null;
        await handler.run(interaction.client, interaction);
        expect(interaction.client.models['temp-channels'].TempChannel.findOne).not.toHaveBeenCalled();
    });

    test('ignores interactions from a different guild', async () => {
        const interaction = baseInteraction({
            guild: {id: 'other'},
            isButton: () => true
        });
        await handler.run(interaction.client, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('button tempc-add replies notInChannel when caller owns no channel', async () => {
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'tempc-add'
        });
        interaction.client.models['temp-channels'].TempChannel.findOne.mockResolvedValue(null);
        await handler.run(interaction.client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'not-in-channel'}));
    });

    test('button tempc-add opens a user-select when caller owns the channel', async () => {
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'tempc-add'
        });
        interaction.client.models['temp-channels'].TempChannel.findOne.mockResolvedValue({id: 'vc1'});
        await handler.run(interaction.client, interaction);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.ephemeral).toBe(true);
        expect(arg.components.length).toBe(1);
    });

    test('user-select with no owned channel replies notInChannel', async () => {
        const interaction = baseInteraction({
            isUserSelectMenu: () => true,
            customId: 'tempc-add-select'
        });
        interaction.client.models['temp-channels'].TempChannel.findOne.mockResolvedValue(null);
        await handler.run(interaction.client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'not-in-channel'}));
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });
});