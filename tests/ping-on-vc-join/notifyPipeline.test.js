/*
 * Tests for the async notify pipeline of ping-on-vc-join's voiceStateUpdate
 * handler: the part that runs after the synchronous voice-role assignment.
 *
 * Covers:
 *  - cross-guild guard (channel belongs to another guild)
 *  - unconfigured channel -> no notify
 *  - bot members ignored
 *  - missing notify channel -> disableModule called
 *  - 3s delayed ping: send happens, with placeholders substituted
 *  - ping skipped if the member left the channel during the delay
 *  - legacy per-user cooldown: second join within window is suppressed
 *  - per-channel cooldown when cooldownEnabled
 *  - optional DM (send_pn_to_member)
 *
 * helpers are mocked so embedType/disableModule/formatDiscordUserName are
 * deterministic and disableModule does not touch the real main client.
 */
jest.useFakeTimers();

const mockDisableModule = jest.fn();
jest.mock('../../src/functions/helpers', () => ({
    embedType: (msg, args) => ({
        message: msg,
        args
    }),
    disableModule: (...a) => mockDisableModule(...a),
    formatDiscordUserName: (user) => `tag:${user.id}`
}));

const handler = require('../../modules/ping-on-vc-join/events/voiceStateUpdate');

function makeNotifyChannel() {
    return {send: jest.fn().mockResolvedValue({id: 'sent'})};
}

function makeMember({
                        bot = false,
                        id = 'u1',
                        channelId = 'vc1'
                    } = {}) {
    return {
        user: {
            bot,
            id,
            send: jest.fn().mockResolvedValue()
        },
        send: jest.fn().mockResolvedValue(),
        voice: {channelId},
        roles: {
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue()
        }
    };
}

function makeClient({
                        moduleConfig,
                        notifyChannel,
                        member,
                        channelGuildID = 'g1'
                    } = {}) {
    const channel = {
        id: 'vc1',
        name: 'General',
        guild: {id: channelGuildID}
    };
    return {
        botReadyAt: Date.now(),
        guild: {
            id: 'g1',
            channels: {cache: {get: jest.fn((id) => (notifyChannel && id === 'notify1' ? notifyChannel : undefined))}},
            members: {fetch: jest.fn().mockResolvedValue(member)}
        },
        channels: {fetch: jest.fn().mockResolvedValue(channel)},
        logger: {info: jest.fn()},
        configurations: {
            'ping-on-vc-join': {
                'actual-config': {
                    assignRoleToUsersInVoiceChannels: false,
                    voiceRoles: []
                },
                config: moduleConfig
            }
        },
        _channel: channel
    };
}

function newStateFor(member, guild) {
    return {
        member,
        channel: {id: 'vc1'},
        channelId: 'vc1',
        id: member.user.id,
        guild
    };
}

const baseElement = {
    channels: ['vc1'],
    notify_channel_id: 'notify1',
    message: 'msg',
    pn_message: 'pn'
};

beforeEach(() => {
    mockDisableModule.mockClear();
});

test('ignores a channel that belongs to another guild', async () => {
    const member = makeMember();
    const notifyChannel = makeNotifyChannel();
    const client = makeClient({
        moduleConfig: [baseElement],
        notifyChannel,
        member,
        channelGuildID: 'other'
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    jest.runOnlyPendingTimers();
    expect(notifyChannel.send).not.toHaveBeenCalled();
});

test('does nothing when the channel is not configured', async () => {
    const member = makeMember();
    const notifyChannel = makeNotifyChannel();
    const client = makeClient({
        moduleConfig: [{
            ...baseElement,
            channels: ['other-vc']
        }],
        notifyChannel,
        member
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    jest.runOnlyPendingTimers();
    expect(notifyChannel.send).not.toHaveBeenCalled();
});

test('ignores bot members joining a configured channel', async () => {
    const member = makeMember({bot: true});
    const notifyChannel = makeNotifyChannel();
    const client = makeClient({
        moduleConfig: [baseElement],
        notifyChannel,
        member
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    jest.runOnlyPendingTimers();
    expect(notifyChannel.send).not.toHaveBeenCalled();
});

test('disables the module when the notify channel is missing', async () => {
    const member = makeMember();
    const client = makeClient({
        moduleConfig: [baseElement],
        notifyChannel: null,
        member
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    expect(mockDisableModule).toHaveBeenCalledWith('ping-on-vc-join', expect.any(String));
});

test('sends the ping after the 3s delay with placeholders substituted', async () => {
    const member = makeMember();
    const notifyChannel = makeNotifyChannel();
    const client = makeClient({
        moduleConfig: [baseElement],
        notifyChannel,
        member
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    expect(notifyChannel.send).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(3000);
    expect(notifyChannel.send).toHaveBeenCalledTimes(1);
    const payload = notifyChannel.send.mock.calls[0][0];
    expect(payload.args['%vc%']).toBe('General');
    expect(payload.args['%tag%']).toBe('tag:u1');
    expect(payload.args['%mention%']).toBe('<@u1>');
});

test('does not ping if the member left the channel during the delay', async () => {
    const member = makeMember({id: 'left-user'});
    const notifyChannel = makeNotifyChannel();
    const client = makeClient({
        moduleConfig: [baseElement],
        notifyChannel,
        member
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    member.voice.channelId = 'somewhere-else';
    await jest.advanceTimersByTimeAsync(3000);
    expect(notifyChannel.send).not.toHaveBeenCalled();
});

test('does not ping if the member fully disconnected during the delay', async () => {
    const member = makeMember({id: 'disc-user'});
    const notifyChannel = makeNotifyChannel();
    const client = makeClient({
        moduleConfig: [baseElement],
        notifyChannel,
        member
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    member.voice = null;
    await jest.advanceTimersByTimeAsync(3000);
    expect(notifyChannel.send).not.toHaveBeenCalled();
});

test('sends an optional DM when send_pn_to_member is set', async () => {
    // unique id: the legacy per-user cooldown is module-level state shared across tests
    const member = makeMember({id: 'dm-user'});
    const notifyChannel = makeNotifyChannel();
    const client = makeClient({
        moduleConfig: [{
            ...baseElement,
            send_pn_to_member: true
        }],
        notifyChannel,
        member
    });
    await handler.run(client, {channel: null}, newStateFor(member, client.guild));
    await jest.advanceTimersByTimeAsync(3000);
    expect(member.send).toHaveBeenCalledTimes(1);
});

test('legacy per-user cooldown suppresses a second ping within the window', async () => {
    const notifyChannel = makeNotifyChannel();
    const moduleConfig = [baseElement];

    const member1 = makeMember({id: 'cool-u'});
    const client1 = makeClient({
        moduleConfig,
        notifyChannel,
        member: member1
    });
    await handler.run(client1, {channel: null}, newStateFor(member1, client1.guild));
    await jest.advanceTimersByTimeAsync(3000);
    expect(notifyChannel.send).toHaveBeenCalledTimes(1);

    // second join for the same user, still within the 5-minute cooldown
    const member2 = makeMember({id: 'cool-u'});
    const client2 = makeClient({
        moduleConfig,
        notifyChannel,
        member: member2
    });
    await handler.run(client2, {channel: null}, newStateFor(member2, client2.guild));
    await jest.advanceTimersByTimeAsync(3000);
    expect(notifyChannel.send).toHaveBeenCalledTimes(1); // unchanged
});

test('per-channel cooldown suppresses a repeat ping in the same channel', async () => {
    const notifyChannel = makeNotifyChannel();
    const element = {
        ...baseElement,
        channels: ['vc-cd'],
        cooldownEnabled: true,
        cooldownMinutes: 5
    };

    const memberA = makeMember({id: 'a'});
    const clientA = makeClient({
        moduleConfig: [element],
        notifyChannel,
        member: memberA
    });
    clientA._channel.id = 'vc-cd';
    clientA.channels.fetch.mockResolvedValue({
        id: 'vc-cd',
        name: 'CD',
        guild: {id: 'g1'}
    });
    clientA.guild.members.fetch.mockResolvedValue(memberA);
    memberA.voice.channelId = 'vc-cd';
    const nsA = {
        member: memberA,
        channel: {id: 'vc-cd'},
        channelId: 'vc-cd',
        id: 'a',
        guild: clientA.guild
    };
    await handler.run(clientA, {channel: null}, nsA);
    await jest.advanceTimersByTimeAsync(3000);
    expect(notifyChannel.send).toHaveBeenCalledTimes(1);

    const memberB = makeMember({id: 'b'});
    const clientB = makeClient({
        moduleConfig: [element],
        notifyChannel,
        member: memberB
    });
    clientB.channels.fetch.mockResolvedValue({
        id: 'vc-cd',
        name: 'CD',
        guild: {id: 'g1'}
    });
    clientB.guild.members.fetch.mockResolvedValue(memberB);
    memberB.voice.channelId = 'vc-cd';
    const nsB = {
        member: memberB,
        channel: {id: 'vc-cd'},
        channelId: 'vc-cd',
        id: 'b',
        guild: clientB.guild
    };
    await handler.run(clientB, {channel: null}, nsB);
    await jest.advanceTimersByTimeAsync(3000);
    // channel still on cooldown -> no second send
    expect(notifyChannel.send).toHaveBeenCalledTimes(1);
});