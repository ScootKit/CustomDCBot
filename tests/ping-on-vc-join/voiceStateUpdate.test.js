/*
 * Behavioural tests for ping-on-vc-join's voiceStateUpdate handler.
 *
 * Focus on the synchronous, branch-heavy part of run(): the optional
 * "assign a voice role while in any VC" feature. This runs before the async
 * notify pipeline, so we can assert role add/remove without driving the
 * 3-second ping timeout. Also covers the early guards (bot not ready,
 * feature disabled, bot members ignored).
 */
const handler = require('../../modules/ping-on-vc-join/events/voiceStateUpdate');

function makeClient(roleConfig, {moduleConfig = []} = {}) {
    return {
        botReadyAt: Date.now(),
        guild: {
            id: 'g1',
            channels: {cache: {get: () => undefined}},
            members: {fetch: jest.fn()}
        },
        channels: {
            fetch: jest.fn().mockResolvedValue({
                id: 'other',
                guild: {id: 'g1'}
            })
        },
        configurations: {
            'ping-on-vc-join': {
                'actual-config': roleConfig,
                config: moduleConfig
            }
        }
    };
}

function makeMember({bot = false} = {}) {
    return {
        user: {
            bot,
            id: 'u1'
        },
        roles: {
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue()
        }
    };
}

const enabledRoleCfg = {
    assignRoleToUsersInVoiceChannels: true,
    voiceRoles: ['role-vc']
};

describe('voice role assignment', () => {
    test('adds the voice role when a user joins from no channel', async () => {
        const member = makeMember();
        const client = makeClient(enabledRoleCfg);
        const oldState = {channel: null};
        const newState = {
            member,
            channel: {id: 'vc1'},
            channelId: 'vc1',
            id: 'u1',
            guild: client.guild
        };
        await handler.run(client, oldState, newState);
        expect(member.roles.add).toHaveBeenCalledWith(['role-vc']);
        expect(member.roles.remove).not.toHaveBeenCalled();
    });

    test('removes the voice role when a user leaves to no channel', async () => {
        const member = makeMember();
        const client = makeClient(enabledRoleCfg);
        const oldState = {channel: {id: 'vc1'}};
        const newState = {
            member,
            channel: null,
            channelId: null,
            id: 'u1',
            guild: client.guild
        };
        await handler.run(client, oldState, newState);
        expect(member.roles.remove).toHaveBeenCalledWith(['role-vc']);
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('does nothing for role assignment when the feature is disabled', async () => {
        const member = makeMember();
        const client = makeClient({
            assignRoleToUsersInVoiceChannels: false,
            voiceRoles: ['role-vc']
        });
        const newState = {
            member,
            channel: {id: 'vc1'},
            channelId: 'vc1',
            id: 'u1',
            guild: client.guild
        };
        await handler.run(client, {channel: null}, newState);
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('skips bots for role assignment', async () => {
        const member = makeMember({bot: true});
        const client = makeClient(enabledRoleCfg);
        const newState = {
            member,
            channel: {id: 'vc1'},
            channelId: 'vc1',
            id: 'u1',
            guild: client.guild
        };
        await handler.run(client, {channel: null}, newState);
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('does not touch roles when voiceRoles list is empty', async () => {
        const member = makeMember();
        const client = makeClient({
            assignRoleToUsersInVoiceChannels: true,
            voiceRoles: []
        });
        const newState = {
            member,
            channel: {id: 'vc1'},
            channelId: 'vc1',
            id: 'u1',
            guild: client.guild
        };
        await handler.run(client, {channel: null}, newState);
        expect(member.roles.add).not.toHaveBeenCalled();
    });
});

describe('early guards', () => {
    test('returns immediately when the bot is not ready', async () => {
        const member = makeMember();
        const client = makeClient(enabledRoleCfg);
        client.botReadyAt = null;
        const newState = {
            member,
            channel: {id: 'vc1'},
            channelId: 'vc1',
            id: 'u1',
            guild: client.guild
        };
        await handler.run(client, {channel: null}, newState);
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('does not re-fetch the channel when the user stayed in the same channel', async () => {
        const member = makeMember();
        const client = makeClient(enabledRoleCfg);
        const sameChannel = {id: 'vc1'};
        const newState = {
            member,
            channel: sameChannel,
            channelId: 'vc1',
            id: 'u1',
            guild: client.guild
        };
        await handler.run(client, {channel: sameChannel}, newState);
        // same channel id -> the notify path returns before fetching
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });
});