/*
 * Regression tests for the tickets button handler.
 *
 * The bug: creating a ticket performed several slow Discord API calls
 * (channel create, message send, pin) BEFORE acknowledging the interaction.
 * Discord requires acknowledgement within 3 seconds, so the token expired and
 * replying afterwards threw "Unknown interaction" (10062). The fix is the
 * acknowledge -> action -> confirm pattern: deferReply() first, editReply() last.
 */

jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));

const mainStub = require('../__stubs__/main');
const handler = require('../../modules/tickets/events/interactionCreate');

function makeElement() {
    return {
        name: 'Support',
        ticketRoles: [],
        'ticket-create-category': 'cat1',
        'creation-message': 'Ticket %id% opened',
        'ticket-close-button': 'Close'
    };
}

function makeClient() {
    return {
        botReadyAt: Date.now(),
        config: {
            guildID: 'g1',
            disableEveryoneProtection: false,
            timezone: 'UTC'
        },
        configurations: {tickets: {config: [makeElement()]}},
        models: {
            tickets: {
                Ticket: {
                    findOne: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue({
                        id: 42,
                        save: jest.fn()
                    })
                }
            }
        },
        logger: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
        }
    };
}

function makeInteraction(customId) {
    const msg = {pin: jest.fn().mockResolvedValue()};
    const channel = {
        id: 'chan-new',
        toString: () => '<#chan-new>',
        send: jest.fn().mockResolvedValue(msg)
    };
    return {
        customId,
        isButton: () => true,
        user: {
            id: 'u1',
            tag: 'User#0001',
            username: 'User',
            discriminator: '0001',
            toString: () => '<@u1>'
        },
        member: {id: 'u1'},
        channel: {
            id: 'panel-chan',
            toString: () => '<#panel-chan>'
        },
        guild: {
            id: 'g1',
            channels: {
                create: jest.fn().mockResolvedValue(channel),
                fetch: jest.fn().mockResolvedValue(null)
            },
            roles: {cache: {find: () => ({id: 'everyone'})}}
        },
        deferReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        createdChannel: channel
    };
}

beforeEach(() => {
    mainStub.client.config = {
        disableEveryoneProtection: false,
        timezone: 'UTC'
    };
    mainStub.client.strings = {
        footer: 'f',
        footerImgUrl: '',
        disableFooterTimestamp: false,
        addAtToUsernames: false
    };
    mainStub.client.scnxSetup = false;
});

describe('tickets create-ticket interaction', () => {
    test('acknowledges the interaction before doing slow Discord work', async () => {
        const client = makeClient();
        const interaction = makeInteraction('create-ticket-0');

        await handler.run(client, interaction);

        expect(interaction.deferReply).toHaveBeenCalledTimes(1);
        // Acknowledge BEFORE the slow channel creation / message send.
        const deferOrder = interaction.deferReply.mock.invocationCallOrder[0];
        expect(interaction.guild.channels.create.mock.invocationCallOrder[0]).toBeGreaterThan(deferOrder);
        expect(interaction.createdChannel.send.mock.invocationCallOrder[0]).toBeGreaterThan(deferOrder);
    });

    test('confirms with editReply (not reply) after the ticket is created', async () => {
        const client = makeClient();
        const interaction = makeInteraction('create-ticket-0');

        await handler.run(client, interaction);

        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        // reply() on an already-acknowledged interaction throws "already acknowledged".
        expect(interaction.reply).not.toHaveBeenCalled();
    });
});