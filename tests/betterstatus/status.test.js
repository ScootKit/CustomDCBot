/*
 * Covers the /status command handler (modules/betterstatus/commands/status.js):
 * mapping the user-facing activity-type string to the discord.js ActivityType
 * enum, attaching the streaming URL only for STREAMING activities, passing
 * through the bot presence status, and the ephemeral confirmation reply. Also
 * exercises the config.disabled() toggle. localize is auto-stubbed.
 */
const {ActivityType} = require('discord.js');
const cmd = require('../../modules/betterstatus/commands/status');

function makeInteraction(opts) {
    return {
        options: {getString: (name) => (name in opts ? opts[name] : null)},
        client: {user: {setPresence: jest.fn().mockResolvedValue()}},
        reply: jest.fn().mockResolvedValue()
    };
}

test('maps WATCHING to the ActivityType.Watching enum and sets presence', async () => {
    const i = makeInteraction({
        'activity-type': 'WATCHING',
        'bot-status': 'idle',
        text: 'the server'
    });
    await cmd.run(i);
    const payload = i.client.user.setPresence.mock.calls[0][0];
    expect(payload.status).toBe('idle');
    expect(payload.activities[0].name).toBe('the server');
    expect(payload.activities[0].type).toBe(ActivityType.Watching);
    expect(payload.activities[0].url).toBeNull();
});

test('attaches the streaming link only for STREAMING activities', async () => {
    const i = makeInteraction({
        'activity-type': 'STREAMING',
        'bot-status': 'online',
        text: 'live',
        'streaming-link': 'https://twitch.tv/x'
    });
    await cmd.run(i);
    const activity = i.client.user.setPresence.mock.calls[0][0].activities[0];
    expect(activity.type).toBe(ActivityType.Streaming);
    expect(activity.url).toBe('https://twitch.tv/x');
});

test('ignores a streaming link for non-streaming activities', async () => {
    const i = makeInteraction({
        'activity-type': 'PLAYING',
        'bot-status': 'dnd',
        text: 'a game',
        'streaming-link': 'https://twitch.tv/x'
    });
    await cmd.run(i);
    expect(i.client.user.setPresence.mock.calls[0][0].activities[0].url).toBeNull();
});

test('maps CUSTOM and LISTENING activity types', async () => {
    const custom = makeInteraction({
        'activity-type': 'CUSTOM',
        'bot-status': 'online',
        text: 'hi'
    });
    await cmd.run(custom);
    expect(custom.client.user.setPresence.mock.calls[0][0].activities[0].type).toBe(ActivityType.Custom);

    const listening = makeInteraction({
        'activity-type': 'LISTENING',
        'bot-status': 'online',
        text: 'music'
    });
    await cmd.run(listening);
    expect(listening.client.user.setPresence.mock.calls[0][0].activities[0].type).toBe(ActivityType.Listening);
});

test('confirms the change with an ephemeral reply containing the status text', async () => {
    const i = makeInteraction({
        'activity-type': 'PLAYING',
        'bot-status': 'online',
        text: 'chess'
    });
    await cmd.run(i);
    const reply = i.reply.mock.calls[0][0];
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toContain('s=chess');
});

describe('config.disabled toggle', () => {
    function clientWith(enableStatusCommand) {
        return {configurations: {betterstatus: {config: {enableStatusCommand}}}};
    }

    test('command is disabled when enableStatusCommand is false', () => {
        expect(cmd.config.disabled(clientWith(false))).toBe(true);
    });
    test('command is enabled when enableStatusCommand is true', () => {
        expect(cmd.config.disabled(clientWith(true))).toBe(false);
    });
});