/*
 * Tests for the /admin movechannel & moverole subcommands (commands/admin.js).
 * Covers the "no new-position given -> report current position" branch versus
 * the "position supplied -> apply setPosition and confirm" branch, for both
 * channels and roles.
 */
const admin = require('../../modules/admin-tools/commands/admin');

function makeInteraction({
                             newPosition,
                             target
                         }) {
    return {
        options: {
            getChannel: () => target,
            getRole: () => target,
            get: (n) => (n === 'new-position' && newPosition !== undefined ? {value: newPosition} : null),
            getInteger: () => newPosition
        },
        reply: jest.fn().mockResolvedValue()
    };
}

describe('movechannel', () => {
    test('reports the current position when no new position is given', async () => {
        const channel = {
            position: 4,
            setPosition: jest.fn().mockResolvedValue(),
            toString: () => '<#c>'
        };
        const i = makeInteraction({target: channel});
        await admin.subcommands.movechannel(i);
        expect(channel.setPosition).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('position')}));
    });

    test('applies setPosition and confirms when a position is supplied', async () => {
        const channel = {
            position: 4,
            setPosition: jest.fn().mockResolvedValue(),
            toString: () => '<#c>'
        };
        const i = makeInteraction({
            newPosition: 2,
            target: channel
        });
        await admin.subcommands.movechannel(i);
        expect(channel.setPosition).toHaveBeenCalledWith(2);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('position-changed')}));
    });
});

describe('moverole', () => {
    test('reports the current position when no new position is given', async () => {
        const role = {
            position: 7,
            setPosition: jest.fn().mockResolvedValue(),
            toString: () => '<@&r>'
        };
        const i = makeInteraction({target: role});
        await admin.subcommands.moverole(i);
        expect(role.setPosition).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('position')}));
    });

    test('applies setPosition and confirms when a position is supplied', async () => {
        const role = {
            position: 7,
            setPosition: jest.fn().mockResolvedValue(),
            toString: () => '<@&r>'
        };
        const i = makeInteraction({
            newPosition: 3,
            target: role
        });
        await admin.subcommands.moverole(i);
        expect(role.setPosition).toHaveBeenCalledWith(3);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('position-changed')}));
    });
});