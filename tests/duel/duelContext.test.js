/*
 * The "Duel" USER context command is a thin adapter: it reuses the /duel run() unchanged by
 * handing it the interaction with options.getUser('user') overridden to return the right-clicked
 * target, so the challenge -> duel flow is identical against that user.
 */
jest.mock('../../modules/duel/commands/duel', () => ({
    run: jest.fn().mockResolvedValue('started')
}));

const {
    allowingChannel,
    denyingChannel
} = require('../__helpers__/permissionChannel');
const duel = require('../../modules/duel/commands/duel');
const command = require('../../modules/duel/commands/duel-context');

beforeEach(() => duel.run.mockClear());

describe('Duel context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to run() with the target resolved as the opponent', async () => {
        const targetUser = {id: 'target'};
        const interaction = {
            client: {id: 'client'},
            member: {id: 'invoker'},
            channel: allowingChannel(),
            targetUser,
            options: {getUser: jest.fn().mockReturnValue({id: 'other'})}
        };
        await command.run(interaction);

        expect(duel.run).toHaveBeenCalledTimes(1);
        const proxy = duel.run.mock.calls[0][0];
        expect(proxy.options.getUser('user')).toBe(targetUser);
        expect(proxy.client).toBe(interaction.client);
    });

    test('passes other option names through to the real interaction options', async () => {
        const interaction = {
            client: {},
            member: {id: 'invoker'},
            channel: allowingChannel(),
            targetUser: {id: 'target'},
            options: {getUser: jest.fn().mockReturnValue({id: 'other'})}
        };
        await command.run(interaction);
        const proxy = duel.run.mock.calls[0][0];
        expect(proxy.options.getUser('somethingElse')).toEqual({id: 'other'});
        expect(interaction.options.getUser).toHaveBeenCalledWith('somethingElse');
    });

    test('replies ephemerally and does NOT start the duel when the member cannot send', async () => {
        const interaction = {
            client: {},
            member: {id: 'invoker'},
            channel: denyingChannel(),
            targetUser: {id: 'target'},
            options: {getUser: jest.fn()},
            reply: jest.fn().mockResolvedValue()
        };
        await command.run(interaction);

        expect(duel.run).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('command.no-send-permission');
    });
});