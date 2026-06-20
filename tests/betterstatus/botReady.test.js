/*
 * Covers the betterstatus botReady handler (modules/betterstatus/events/botReady.js):
 *  - the initial setActivity with the replaced user_presence string
 *  - placeholder replacement (%memberCount%, %onlineMemberCount%, %channelCount%,
 *    %roleCount%, %randomOnlineMemberTag%, %randomMemberTag%) against real-ish
 *    discord.js Collections
 *  - the interval registration (enableInterval) and its >=5s clamp
 *  - botStatus !== 'ONLINE' calling setPresence
 *  - the non-PLAYING / non-interval extra setActivity branch
 *  - the streaming url being attached only for STREAMING activity in the interval
 * formatDiscordUserName comes from the real helpers; localize/main auto-stubbed.
 */
const {Collection} = require('discord.js');
const botReady = require('../../modules/betterstatus/events/botReady');

function makeMember({
                        bot = false,
                        status = 'online',
                        username = 'user',
                        discriminator = '0'
                    } = {}) {
    return {
        presence: status ? {status} : null,
        user: {
            bot,
            username,
            discriminator
        }
    };
}

function makeClient(config, {
    members = [],
    roleCount = 3,
    channelCount = 4,
    memberCount = 10
} = {}) {
    const cache = new Collection();
    members.forEach((m, i) => cache.set(String(i), m));
    return {
        intervals: [],
        config: {user_presence: 'Hi %memberCount%'},
        configurations: {betterstatus: {config}},
        guild: {
            memberCount,
            members: {cache},
            channels: {cache: new Collection(Array.from({length: channelCount}, (_, i) => [String(i), {}]))},
            roles: {fetch: jest.fn().mockResolvedValue(new Collection(Array.from({length: roleCount}, (_, i) => [String(i), {}])))}
        },
        user: {
            username: 'Bot',
            setActivity: jest.fn().mockResolvedValue(),
            setPresence: jest.fn().mockResolvedValue()
        }
    };
}

const baseConf = (over = {}) => ({
    activityType: 'PLAYING',
    botStatus: 'ONLINE',
    enableInterval: false,
    interval: 30,
    intervalStatuses: [],
    streamingLink: '',
    ...over
});

afterEach(() => jest.useRealTimers());

test('sets the initial activity with the replaced presence string', async () => {
    const client = makeClient(baseConf(), {members: [makeMember(), makeMember({bot: true})]});
    await botReady.run(client);
    expect(client.user.setActivity).toHaveBeenCalled();
    const firstArg = client.user.setActivity.mock.calls[0][0];
    expect(firstArg).toBe('Hi 10'); // %memberCount% replaced with guild.memberCount
});

test('replaces member/channel/role placeholders', async () => {
    const client = makeClient(baseConf(), {
        members: [makeMember({status: 'online'}), makeMember({status: 'dnd'}), makeMember({status: null})],
        roleCount: 7,
        channelCount: 5,
        memberCount: 42
    });
    client.config.user_presence = 'M:%memberCount% O:%onlineMemberCount% C:%channelCount% R:%roleCount%';
    await botReady.run(client);
    const text = client.user.setActivity.mock.calls[0][0];
    // onlineMemberCount = members with presence and not bot = 2
    expect(text).toBe('M:42 O:2 C:5 R:7');
});

test('returns "Invalid status" for a falsy presence string', async () => {
    const client = makeClient(baseConf(), {members: [makeMember()]});
    client.config.user_presence = '';
    await botReady.run(client);
    expect(client.user.setActivity.mock.calls[0][0]).toBe('Invalid status');
});

test('replaces %randomMemberTag% using the username#discriminator form', async () => {
    const client = makeClient(baseConf(), {
        members: [makeMember({
            username: 'alice',
            discriminator: '1234'
        })]
    });
    client.config.user_presence = 'T:%randomMemberTag%';
    await botReady.run(client);
    expect(client.user.setActivity.mock.calls[0][0]).toBe('T:alice#1234');
});

test('registers an interval when enableInterval is set and clamps below 5s', async () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const client = makeClient(baseConf({
        enableInterval: true,
        interval: 2,
        intervalStatuses: ['Status A']
    }), {
        members: [makeMember()]
    });
    await botReady.run(client);
    expect(client.intervals).toHaveLength(1);
    // interval 2s -> clamped to 5000ms
    expect(setIntervalSpy.mock.calls[0][1]).toBe(5000);
    setIntervalSpy.mockRestore();
});

test('interval uses interval*1000 when >= 5s', async () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const client = makeClient(baseConf({
        enableInterval: true,
        interval: 30,
        intervalStatuses: ['x']
    }), {
        members: [makeMember()]
    });
    await botReady.run(client);
    expect(setIntervalSpy.mock.calls[0][1]).toBe(30000);
    setIntervalSpy.mockRestore();
});

test('the interval callback sets a random activity from intervalStatuses', async () => {
    jest.useFakeTimers();
    const client = makeClient(baseConf({
        enableInterval: true,
        interval: 30,
        intervalStatuses: ['Only One']
    }), {
        members: [makeMember()]
    });
    await botReady.run(client);
    client.user.setActivity.mockClear();
    await jest.advanceTimersByTimeAsync(30000);
    expect(client.user.setActivity).toHaveBeenCalled();
    expect(client.user.setActivity.mock.calls[0][0]).toBe('Only One');
});

test('sets presence when botStatus is not ONLINE', async () => {
    const client = makeClient(baseConf({botStatus: 'dnd'}), {members: [makeMember()]});
    await botReady.run(client);
    expect(client.user.setPresence).toHaveBeenCalledWith({status: 'dnd'});
});

test('does not call setPresence when botStatus is ONLINE', async () => {
    const client = makeClient(baseConf({botStatus: 'ONLINE'}), {members: [makeMember()]});
    await botReady.run(client);
    expect(client.user.setPresence).not.toHaveBeenCalled();
});

test('non-PLAYING activity without interval triggers a second setActivity with raw presence', async () => {
    const client = makeClient(baseConf({
        activityType: 'WATCHING',
        enableInterval: false
    }), {members: [makeMember()]});
    await botReady.run(client);
    // First call: replaced string. Second call: raw client.config.user_presence
    expect(client.user.setActivity).toHaveBeenCalledTimes(2);
    expect(client.user.setActivity.mock.calls[1][0]).toBe(client.config.user_presence);
});

test('attaches a streaming url for STREAMING activity in the extra setActivity', async () => {
    const client = makeClient(
        baseConf({
            activityType: 'STREAMING',
            enableInterval: false,
            streamingLink: 'https://twitch.tv/x'
        }),
        {members: [makeMember()]}
    );
    await botReady.run(client);
    const secondOpts = client.user.setActivity.mock.calls[1][1];
    expect(secondOpts.url).toBe('https://twitch.tv/x');
});

test('PLAYING activity without interval does NOT do a second setActivity', async () => {
    const client = makeClient(baseConf({
        activityType: 'PLAYING',
        enableInterval: false
    }), {members: [makeMember()]});
    await botReady.run(client);
    expect(client.user.setActivity).toHaveBeenCalledTimes(1);
});