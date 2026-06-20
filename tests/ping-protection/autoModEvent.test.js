/*
 * Tests for ping-protection's autoModerationActionExecution handler. It maps a
 * blocked AutoMod keyword back to a protected role/user, resolves the origin
 * channel, applies whitelist + ignored-user guards, and dispatches processPing
 * for protected targets only.
 */
const mockProcessPing = jest.fn().mockResolvedValue();
const mockIsWhitelisted = jest.fn(() => false);
jest.mock('../../modules/ping-protection/ping-protection', () => ({
    processPing: (...a) => mockProcessPing(...a),
    isWhitelistedChannel: (...a) => mockIsWhitelisted(...a)
}));

const handler = require('../../modules/ping-protection/events/autoModerationActionExecution');

function makeClient(configOverrides = {}) {
    return {
        configurations: {
            'ping-protection': {
                configuration: {
                    ignoredUsers: [],
                    protectedRoles: [],
                    protectedUsers: [],
                    protectAllUsersWithProtectedRole: false,
                    ...configOverrides
                }
            }
        }
    };
}

function makeExecution({
                           userId = 'pinger',
                           matchedKeyword = '<@victim>',
                           channel = {id: 'c1'},
                           members = {}
                       } = {}) {
    return {
        ruleTriggerType: 1,
        userId,
        matchedKeyword,
        channel,
        guild: {
            channels: {fetch: jest.fn().mockResolvedValue({id: 'fetched'})},
            members: {
                fetch: jest.fn((id) => Promise.resolve(members[id] || {
                    id,
                    roles: {cache: {some: () => false}}
                }))
            }
        }
    };
}

beforeEach(() => {
    mockProcessPing.mockClear();
    mockIsWhitelisted.mockClear();
    mockIsWhitelisted.mockReturnValue(false);
});

test('ignores non-keyword automod triggers', async () => {
    const exec = makeExecution();
    exec.ruleTriggerType = 2;
    await handler.run(makeClient(), exec);
    expect(mockProcessPing).not.toHaveBeenCalled();
});

test('ignores users on the ignore list', async () => {
    const client = makeClient({ignoredUsers: ['pinger']});
    await handler.run(client, makeExecution());
    expect(mockProcessPing).not.toHaveBeenCalled();
});

test('dispatches processPing when a protected user was pinged', async () => {
    const client = makeClient({protectedUsers: ['111222']});
    const member = {
        id: 'pinger',
        roles: {cache: {some: () => false}}
    };
    const exec = makeExecution({
        matchedKeyword: '<@111222>',
        members: {
            pinger: member,
            '111222': {}
        }
    });
    await handler.run(client, exec);
    expect(mockProcessPing).toHaveBeenCalledWith(
        client, 'pinger', '111222', false, 'Blocked by AutoMod', exec.channel, member
    );
});

test('flags isRole true when a protected role keyword matched', async () => {
    const client = makeClient({protectedRoles: ['999888']});
    const member = {
        id: 'pinger',
        roles: {cache: {some: () => false}}
    };
    const exec = makeExecution({
        matchedKeyword: '<@&999888>',
        members: {pinger: member}
    });
    await handler.run(client, exec);
    expect(mockProcessPing).toHaveBeenCalledWith(
        client, 'pinger', '999888', true, 'Blocked by AutoMod', exec.channel, member
    );
});

test('does nothing when the target is not protected', async () => {
    const client = makeClient({protectedUsers: ['someone-else']});
    await handler.run(client, makeExecution({matchedKeyword: '<@111222>'}));
    expect(mockProcessPing).not.toHaveBeenCalled();
});

test('skips when the origin channel is whitelisted', async () => {
    mockIsWhitelisted.mockReturnValue(true);
    const client = makeClient({protectedUsers: ['victim']});
    await handler.run(client, makeExecution());
    expect(mockProcessPing).not.toHaveBeenCalled();
});

test('resolves protectAllUsersWithProtectedRole by inspecting the target member', async () => {
    const client = makeClient({
        protectAllUsersWithProtectedRole: true,
        protectedRoles: ['roleX']
    });
    const pinger = {
        id: 'pinger',
        roles: {cache: {some: () => false}}
    };
    const protectedTarget = {roles: {cache: {some: (fn) => fn({id: 'roleX'})}}};
    const exec = makeExecution({
        matchedKeyword: '<@333444>',
        members: {
            pinger,
            '333444': protectedTarget
        }
    });
    await handler.run(client, exec);
    expect(mockProcessPing).toHaveBeenCalled();
});

test('fetches the origin channel by id when channel is absent', async () => {
    const client = makeClient({protectedUsers: ['111222']});
    const pinger = {
        id: 'pinger',
        roles: {cache: {some: () => false}}
    };
    const exec = makeExecution({
        channel: null,
        matchedKeyword: '<@111222>',
        members: {pinger}
    });
    exec.channelId = 'c-by-id';
    await handler.run(client, exec);
    expect(exec.guild.channels.fetch).toHaveBeenCalledWith('c-by-id');
});