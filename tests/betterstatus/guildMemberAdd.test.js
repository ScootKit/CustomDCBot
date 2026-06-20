/*
 * Covers the betterstatus guildMemberAdd handler
 * (modules/betterstatus/events/guildMemberAdd.js): when changeOnUserJoin is on,
 * it sets the bot activity to userJoinStatus with %tag%/%username%/%memberCount%
 * replaced; when off, it does nothing. formatDiscordUserName is the real helper.
 */
const {ActivityType} = require('discord.js');
const handler = require('../../modules/betterstatus/events/guildMemberAdd');

function makeClient(config) {
    return {
        configurations: {betterstatus: {config}},
        user: {setActivity: jest.fn().mockResolvedValue()}
    };
}

function makeMember({
                        username = 'newbie',
                        memberCount = 100
                    } = {}) {
    return {
        user: {
            username,
            discriminator: '0'
        },
        guild: {memberCount}
    };
}

test('changes activity on join, replacing username and memberCount', async () => {
    const client = makeClient({
        changeOnUserJoin: true,
        userJoinStatus: 'Welcome %username% (%memberCount%)',
        activityType: 'WATCHING'
    });
    const member = makeMember({
        username: 'zoe',
        memberCount: 250
    });
    await handler.run(client, member);
    expect(client.user.setActivity).toHaveBeenCalledTimes(1);
    const [text, opts] = client.user.setActivity.mock.calls[0];
    expect(text).toBe('Welcome zoe (250)');
    expect(opts.type).toBe(ActivityType.Watching);
});

test('replaces the %tag% placeholder', async () => {
    const client = makeClient({
        changeOnUserJoin: true,
        userJoinStatus: 'Tag: %tag%',
        activityType: 'PLAYING'
    });
    await handler.run(client, makeMember({username: 'bob'}));
    expect(client.user.setActivity.mock.calls[0][0]).toContain('bob');
});

test('does nothing when changeOnUserJoin is disabled', async () => {
    const client = makeClient({
        changeOnUserJoin: false,
        userJoinStatus: 'x',
        activityType: 'PLAYING'
    });
    await handler.run(client, makeMember());
    expect(client.user.setActivity).not.toHaveBeenCalled();
});