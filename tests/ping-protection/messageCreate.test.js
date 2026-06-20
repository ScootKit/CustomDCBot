/*
 * Tests for ping-protection's messageCreate handler.
 *
 * Covers the guard chain (botReady, guild match, bots, whitelisted channel,
 * ignored users/roles), protected-target detection (protected user vs protected
 * role mention, protectAllUsersWithProtectedRole), the reply-ping allowance, the
 * self-ping "Ignored" short circuit, and the warn + processPing dispatch for a
 * genuine protected ping.
 */
const mockProcessPing = jest.fn().mockResolvedValue();
const mockSendWarning = jest.fn().mockResolvedValue();
const mockIsWhitelisted = jest.fn(() => false);
jest.mock('../../modules/ping-protection/ping-protection', () => ({
    processPing: (...a) => mockProcessPing(...a),
    sendPingWarning: (...a) => mockSendWarning(...a),
    isWhitelistedChannel: (...a) => mockIsWhitelisted(...a)
}));

const handler = require('../../modules/ping-protection/events/messageCreate');

function makeCollection(items) {
    const map = new Map(items.map(i => [i.id, i]));
    return {
        size: map.size,
        get: (id) => map.get(id),
        forEach: (cb) => map.forEach(cb),
        some: (fn) => [...map.values()].some(fn),
        find: (fn) => [...map.values()].find(fn)
    };
}

function makeConfig(over = {}) {
    return {
        ignoredUsers: [],
        ignoredRoles: [],
        protectedRoles: [],
        protectedUsers: [],
        protectAllUsersWithProtectedRole: false,
        allowReplyPings: false,
        selfPingConfiguration: 'Off',
        ...over
    };
}

function makeClient(config) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        configurations: {'ping-protection': {configuration: config}}
    };
}

function makeMessage({
                         authorId = 'pinger',
                         bot = false,
                         users = [],
                         roles = [],
                         repliedUser = null,
                         members = [],
                         content = '',
                         memberRoles = []
                     } = {}) {
    const memberCollection = makeCollection(members);
    return {
        guild: {
            id: 'g1',
            members: {fetch: jest.fn().mockResolvedValue({id: authorId})}
        },
        author: {
            id: authorId,
            bot
        },
        url: 'http://msg',
        content,
        channel: {
            id: 'c1',
            send: jest.fn()
        },
        member: {roles: {cache: makeCollection(memberRoles)}},
        mentions: {
            roles: makeCollection(roles),
            users: makeCollection(users),
            members: memberCollection,
            repliedUser
        },
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    mockProcessPing.mockClear();
    mockSendWarning.mockClear();
    mockIsWhitelisted.mockClear();
    mockIsWhitelisted.mockReturnValue(false);
});

describe('guards', () => {
    test('ignores messages before botReady', async () => {
        const client = makeClient(makeConfig());
        client.botReadyAt = undefined;
        await handler.run(client, makeMessage());
        expect(mockProcessPing).not.toHaveBeenCalled();
    });

    test('ignores messages from other guilds', async () => {
        const client = makeClient(makeConfig());
        const msg = makeMessage();
        msg.guild.id = 'other';
        await handler.run(client, msg);
        expect(mockProcessPing).not.toHaveBeenCalled();
    });

    test('ignores bot authors', async () => {
        const client = makeClient(makeConfig({protectedUsers: ['victim']}));
        await handler.run(client, makeMessage({
            bot: true,
            users: [{id: 'victim'}]
        }));
        expect(mockProcessPing).not.toHaveBeenCalled();
    });

    test('ignores whitelisted channels', async () => {
        mockIsWhitelisted.mockReturnValue(true);
        const client = makeClient(makeConfig({protectedUsers: ['victim']}));
        await handler.run(client, makeMessage({users: [{id: 'victim'}]}));
        expect(mockProcessPing).not.toHaveBeenCalled();
    });

    test('ignores configured ignored users', async () => {
        const client = makeClient(makeConfig({
            ignoredUsers: ['pinger'],
            protectedUsers: ['victim']
        }));
        await handler.run(client, makeMessage({users: [{id: 'victim'}]}));
        expect(mockProcessPing).not.toHaveBeenCalled();
    });

    test('ignores authors holding an ignored role', async () => {
        const client = makeClient(makeConfig({
            ignoredRoles: ['roleI'],
            protectedUsers: ['victim']
        }));
        await handler.run(client, makeMessage({
            users: [{id: 'victim'}],
            memberRoles: [{id: 'roleI'}]
        }));
        expect(mockProcessPing).not.toHaveBeenCalled();
    });

    test('does nothing when no protected entity was pinged', async () => {
        const client = makeClient(makeConfig({protectedUsers: ['victim']}));
        await handler.run(client, makeMessage({users: [{id: 'random'}]}));
        expect(mockProcessPing).not.toHaveBeenCalled();
    });
});

describe('protected ping dispatch', () => {
    test('warns and processes a protected-user ping', async () => {
        const client = makeClient(makeConfig({protectedUsers: ['victim']}));
        const victimUser = {
            id: 'victim',
            username: 'Victim'
        };
        const msg = makeMessage({users: [victimUser]});
        await handler.run(client, msg);
        expect(mockSendWarning).toHaveBeenCalledWith(client, msg, victimUser, expect.any(Object));
        expect(mockProcessPing).toHaveBeenCalledWith(
            client, 'pinger', 'victim', false, 'http://msg', msg.channel, msg.member
        );
    });

    test('treats a protected-role mention as isRole=true', async () => {
        const client = makeClient(makeConfig({protectedRoles: ['roleP']}));
        const role = {id: 'roleP'}; // no username -> role
        const msg = makeMessage({roles: [role]});
        await handler.run(client, msg);
        expect(mockProcessPing).toHaveBeenCalledWith(
            client, 'pinger', 'roleP', true, 'http://msg', msg.channel, msg.member
        );
    });

    test('protectAllUsersWithProtectedRole catches a member with a protected role', async () => {
        const client = makeClient(makeConfig({
            protectAllUsersWithProtectedRole: true,
            protectedRoles: ['roleP']
        }));
        const victimUser = {
            id: 'victim',
            username: 'V'
        };
        const victimMember = {roles: {cache: makeCollection([{id: 'roleP'}])}};
        const msg = makeMessage({
            users: [victimUser],
            members: [{id: 'victim', ...victimMember}]
        });
        await handler.run(client, msg);
        expect(mockProcessPing).toHaveBeenCalled();
    });
});

describe('self-ping', () => {
    test('does nothing when selfPingConfiguration is Ignored', async () => {
        const client = makeClient(makeConfig({
            protectedUsers: ['pinger'],
            selfPingConfiguration: 'Ignored'
        }));
        const msg = makeMessage({
            authorId: 'pinger',
            users: [{
                id: 'pinger',
                username: 'Me'
            }]
        });
        await handler.run(client, msg);
        expect(mockSendWarning).not.toHaveBeenCalled();
        expect(mockProcessPing).not.toHaveBeenCalled();
    });
});

describe('reply pings', () => {
    test('does not punish an auto reply-ping of a protected user when not manually typed', async () => {
        const client = makeClient(makeConfig({
            protectedUsers: ['victim'],
            allowReplyPings: true
        }));
        const victimUser = {
            id: 'victim',
            username: 'V'
        };
        // replied user is the protected victim, content has no manual <@victim>
        const msg = makeMessage({
            users: [victimUser],
            repliedUser: {id: 'victim'},
            content: 'just replying'
        });
        await handler.run(client, msg);
        expect(mockProcessPing).not.toHaveBeenCalled();
    });

    test('still punishes when the protected user is also manually pinged in content', async () => {
        const client = makeClient(makeConfig({
            protectedUsers: ['victim'],
            allowReplyPings: true
        }));
        const victimUser = {
            id: 'victim',
            username: 'V'
        };
        const msg = makeMessage({
            users: [victimUser],
            repliedUser: {id: 'victim'},
            content: 'hey <@victim> look'
        });
        await handler.run(client, msg);
        expect(mockProcessPing).toHaveBeenCalled();
    });
});