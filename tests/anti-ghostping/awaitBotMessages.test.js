/*
 * Tests for the anti-ghostping awaitBotMessages delayed path in
 * modules/anti-ghostping/events/messageDelete.js.
 *
 * When awaitBotMessages is on, the handler waits 2s and only fires the ghost-ping
 * notice if no bot message has appeared in the channel after the deleted message
 * (this suppresses notices for messages a bot deleted, e.g. automod). Covers:
 *   - fires after the delay when no bot message followed
 *   - stays silent when a bot message followed the deleted one
 *   - stays silent if the tracked entry was evicted before the timer fires
 *
 * Fake timers drive the 2s window deterministically.
 */

const createHandler = require('../../modules/anti-ghostping/events/messageCreate.js');
const deleteHandler = require('../../modules/anti-ghostping/events/messageDelete.js');

const {messageWithMentions} = createHandler;

function clearTracked() {
    for (const k of Object.keys(messageWithMentions)) delete messageWithMentions[k];
}

function mentionCollection(members) {
    return {
        filter(fn) {
            const kept = members.filter(fn);
            return {
                size: kept.length,
                forEach: (cb) => kept.forEach(cb)
            };
        }
    };
}

function makeClient() {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        config: {guildID: 'g1'},
        configurations: {
            'anti-ghostping': {
                config: {
                    ignoredChannels: [],
                    awaitBotMessages: true,
                    youJustGotGhostPinged: 'ping %mentions% %authorMention%'
                }
            }
        }
    };
}

function makeDeletedMsg({
                            id = 'm1',
                            followingMessages = []
                        } = {}) {
    const send = jest.fn().mockResolvedValue();
    return {
        _send: send,
        id,
        guild: {id: 'g1'},
        author: {
            id: 'author',
            bot: false,
            toString: () => '<@author>'
        },
        channel: {
            id: 'c1',
            send,
            messages: {fetch: jest.fn().mockResolvedValue(mentionCollection(followingMessages))}
        },
        content: 'hey @other',
        mentions: {
            members: mentionCollection([{
                id: 'other',
                user: {bot: false}
            }])
        }
    };
}

beforeEach(() => {
    clearTracked();
    jest.useFakeTimers();
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

test('fires the notice after 2s when no bot message followed', async () => {
    const tracked = makeDeletedMsg();
    messageWithMentions['m1'] = tracked;
    const del = makeDeletedMsg({followingMessages: []});

    await deleteHandler.run(makeClient(), del);
    expect(del._send).not.toHaveBeenCalled(); // not yet — waiting

    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();

    expect(del.channel.messages.fetch).toHaveBeenCalledWith({after: 'm1'});
    expect(del._send).toHaveBeenCalledTimes(1);
});

test('stays silent when a bot message followed the deleted one', async () => {
    const tracked = makeDeletedMsg();
    messageWithMentions['m1'] = tracked;
    const del = makeDeletedMsg({followingMessages: [{author: {bot: true}}]});

    await deleteHandler.run(makeClient(), del);
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();

    expect(del._send).not.toHaveBeenCalled();
});

test('stays silent if the tracked entry was evicted before the timer fires', async () => {
    const tracked = makeDeletedMsg();
    messageWithMentions['m1'] = tracked;
    const del = makeDeletedMsg({followingMessages: []});

    await deleteHandler.run(makeClient(), del);
    // Simulate the 60s eviction happening before the 2s recheck completes.
    delete messageWithMentions['m1'];

    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();

    expect(del._send).not.toHaveBeenCalled();
});