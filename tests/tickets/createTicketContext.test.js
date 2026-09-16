/*
 * The "Create Ticket About Message" MESSAGE context command is a thin adapter over the shared
 * createTicket() core in events/interactionCreate.js. It delegates for the first configured
 * ticket type, passing a reference to the targeted message (jump link + quoted content). The
 * description localize key is not asserted.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key, replace) => `${file}.${key}:${JSON.stringify(replace || {})}`}));
jest.mock('../../modules/tickets/events/interactionCreate', () => ({
    closeTicket: jest.fn(),
    createTicket: jest.fn().mockResolvedValue('created')
}));

const {createTicket} = require('../../modules/tickets/events/interactionCreate');
const command = require('../../modules/tickets/commands/create-ticket-about-message');

function makeInteraction({
    config = [{name: 'Support'}],
    content = 'hello world'
} = {}) {
    return {
        client: {configurations: {tickets: {config}}},
        targetMessage: {
            id: 'm1',
            url: 'https://discord.com/channels/g/c/m1',
            content,
            author: {toString: () => '<@author>'}
        },
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => createTicket.mockClear());

describe('Create Ticket About Message context command', () => {
    test('config: MESSAGE context, everyone (no permissions)', () => {
        expect(command.config.name).toBe('Create Ticket About Message');
        expect(command.config.type).toBe('MESSAGE');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to createTicket for type 0 with a reference carrying the jump link', async () => {
        const interaction = makeInteraction();
        await command.run(interaction);
        expect(createTicket).toHaveBeenCalledTimes(1);
        const [client, passedInteraction, element, typeIndex, reference] = createTicket.mock.calls[0];
        expect(client).toBe(interaction.client);
        expect(passedInteraction).toBe(interaction);
        expect(element).toBe(interaction.client.configurations.tickets.config[0]);
        expect(typeIndex).toBe(0);
        expect(reference).toContain(interaction.targetMessage.url);
        expect(reference).toContain('> hello world');
    });

    test('replies ephemerally when no ticket type is configured', async () => {
        const interaction = makeInteraction({config: []});
        await command.run(interaction);
        expect(createTicket).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });
});