/*
 * Covers the auto-thread messageCreate handler
 * (modules/auto-thread/events/messageCreate.js): the guard conditions that
 * suppress thread creation (bot not ready, interaction/system messages,
 * non-configured channels, message already has a thread) and the happy path
 * that starts a thread with the configured name and the mapped
 * autoArchiveDuration. ThreadAutoArchiveDuration values come from the real
 * discord.js enum; localize is auto-stubbed.
 */
const {ThreadAutoArchiveDuration} = require('discord.js');
const handler = require('../../modules/auto-thread/events/messageCreate');

function makeClient(config = {}) {
    return {
        botReadyAt: Date.now(),
        configurations: {
            'auto-thread': {
                config: {
                    channels: ['chan-1'],
                    threadName: 'Discussion',
                    threadArchiveDuration: '1440',
                    ...config
                }
            }
        }
    };
}

function makeMessage(overrides = {}) {
    return {
        interaction: null,
        system: false,
        channel: {id: 'chan-1'},
        hasThread: false,
        startThread: jest.fn().mockResolvedValue({}),
        ...overrides
    };
}

test('starts a thread in a configured channel with the mapped duration', async () => {
    const client = makeClient();
    const msg = makeMessage();
    await handler.run(client, msg);
    expect(msg.startThread).toHaveBeenCalledTimes(1);
    const arg = msg.startThread.mock.calls[0][0];
    expect(arg.name).toBe('Discussion');
    expect(arg.autoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneDay);
});

test('maps the MAX duration keyword to one week', async () => {
    const client = makeClient({threadArchiveDuration: 'MAX'});
    const msg = makeMessage();
    await handler.run(client, msg);
    expect(msg.startThread.mock.calls[0][0].autoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneWeek);
});

test('does nothing before the bot is ready', async () => {
    const client = makeClient();
    client.botReadyAt = null;
    const msg = makeMessage();
    await handler.run(client, msg);
    expect(msg.startThread).not.toHaveBeenCalled();
});

test('ignores interaction responses and system messages', async () => {
    const client = makeClient();
    const interactionMsg = makeMessage({interaction: {id: 'x'}});
    const systemMsg = makeMessage({system: true});
    await handler.run(client, interactionMsg);
    await handler.run(client, systemMsg);
    expect(interactionMsg.startThread).not.toHaveBeenCalled();
    expect(systemMsg.startThread).not.toHaveBeenCalled();
});

test('ignores messages in non-configured channels', async () => {
    const client = makeClient();
    const msg = makeMessage({channel: {id: 'other-channel'}});
    await handler.run(client, msg);
    expect(msg.startThread).not.toHaveBeenCalled();
});

test('does not create a second thread when one already exists', async () => {
    const client = makeClient();
    const msg = makeMessage({hasThread: true});
    await handler.run(client, msg);
    expect(msg.startThread).not.toHaveBeenCalled();
});

test('tolerates a missing channels array in config', async () => {
    const client = makeClient({channels: undefined});
    const msg = makeMessage();
    await expect(handler.run(client, msg)).resolves.toBeUndefined();
    expect(msg.startThread).not.toHaveBeenCalled();
});