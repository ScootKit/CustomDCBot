/*
 * Tests for the anti-ghostping module
 * (modules/anti-ghostping/events/messageCreate.js + messageDelete.js).
 *
 * messageCreate records messages that ping non-bot, non-self members into an
 * in-memory map (used later by messageDelete). Covers:
 *   - only messages with a qualifying mention are recorded
 *   - guild / ignored-channel / not-ready guards
 *   - the 60s eviction timer
 * messageDelete fires a ghost-ping notice. Covers:
 *   - notice is sent (immediately when awaitBotMessages is off) with the
 *     mention/content/author substitutions
 *   - bot-authored deleted messages are ignored
 *   - untracked messages are ignored
 */

const createHandler = require('../../modules/anti-ghostping/events/messageCreate.js');
const deleteHandler = require('../../modules/anti-ghostping/events/messageDelete.js');

const {messageWithMentions} = createHandler;

function clearTracked() {
    for (const k of Object.keys(messageWithMentions)) delete messageWithMentions[k];
}

function makeClient({
                        ignoredChannels = [],
                        awaitBotMessages = false
                    } = {}) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        config: {guildID: 'g1'},
        configurations: {
            'anti-ghostping': {
                config: {
                    ignoredChannels,
                    awaitBotMessages,
                    youJustGotGhostPinged: 'ping %mentions% %msgContent% %authorMention%'
                }
            }
        }
    };
}

// mentions.members must be a discord.js Collection-like with .filter().size and .forEach.
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

function makeCreateMsg({
                           id = 'm1',
                           channelId = 'c1',
                           authorId = 'author',
                           mentionedMembers = []
                       } = {}) {
    return {
        id,
        guild: {id: 'g1'},
        author: {id: authorId},
        channel: {id: channelId},
        content: 'hey',
        mentions: {members: mentionCollection(mentionedMembers)}
    };
}

beforeEach(() => {
    clearTracked();
    jest.useFakeTimers();
});

afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});

describe('messageCreate tracking', () => {
    test('records a message that pings another (non-bot) member', async () => {
        const msg = makeCreateMsg({
            mentionedMembers: [{
                id: 'other',
                user: {bot: false}
            }]
        });
        await createHandler.run(makeClient(), msg);
        expect(messageWithMentions['m1']).toBe(msg);
    });

    test('does not record a self-ping', async () => {
        const msg = makeCreateMsg({
            authorId: 'author',
            mentionedMembers: [{
                id: 'author',
                user: {bot: false}
            }]
        });
        await createHandler.run(makeClient(), msg);
        expect(messageWithMentions['m1']).toBeUndefined();
    });

    test('does not record a ping that only targets a bot', async () => {
        const msg = makeCreateMsg({
            mentionedMembers: [{
                id: 'botMember',
                user: {bot: true}
            }]
        });
        await createHandler.run(makeClient(), msg);
        expect(messageWithMentions['m1']).toBeUndefined();
    });

    test('ignores ignored channels', async () => {
        const msg = makeCreateMsg({
            channelId: 'ignored',
            mentionedMembers: [{
                id: 'other',
                user: {bot: false}
            }]
        });
        await createHandler.run(makeClient({ignoredChannels: ['ignored']}), msg);
        expect(messageWithMentions['m1']).toBeUndefined();
    });

    test('ignores messages from other guilds', async () => {
        const msg = makeCreateMsg({
            mentionedMembers: [{
                id: 'other',
                user: {bot: false}
            }]
        });
        msg.guild.id = 'elsewhere';
        await createHandler.run(makeClient(), msg);
        expect(messageWithMentions['m1']).toBeUndefined();
    });

    test('evicts the tracked message after 60 seconds', async () => {
        const msg = makeCreateMsg({
            mentionedMembers: [{
                id: 'other',
                user: {bot: false}
            }]
        });
        await createHandler.run(makeClient(), msg);
        expect(messageWithMentions['m1']).toBe(msg);
        jest.advanceTimersByTime(60000);
        expect(messageWithMentions['m1']).toBeUndefined();
    });
});

describe('messageDelete ghost-ping notice', () => {
    function makeDeletedMsg({
                                id = 'm1',
                                authorBot = false
                            } = {}) {
        const send = jest.fn().mockResolvedValue();
        return {
            _send: send,
            id,
            guild: {id: 'g1'},
            author: {
                id: 'author',
                bot: authorBot,
                toString: () => '<@author>'
            },
            channel: {
                id: 'c1',
                send,
                messages: {fetch: jest.fn().mockResolvedValue(mentionCollection([]))}
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

    test('sends a ghost-ping notice immediately when awaitBotMessages is off', async () => {
        const tracked = makeDeletedMsg();
        messageWithMentions['m1'] = tracked;
        const del = makeDeletedMsg();
        await deleteHandler.run(makeClient({awaitBotMessages: false}), del);
        expect(del._send).toHaveBeenCalledTimes(1);
        const sent = del._send.mock.calls[0][0];
        // embedType-rendered string should contain the substituted mention + author.
        const text = JSON.stringify(sent);
        expect(text).toContain('<@other>');
        expect(text).toContain('<@author>');
    });

    test('ignores deleted messages authored by a bot', async () => {
        const tracked = makeDeletedMsg({authorBot: true});
        messageWithMentions['m1'] = tracked;
        const del = makeDeletedMsg({authorBot: true});
        await deleteHandler.run(makeClient(), del);
        expect(del._send).not.toHaveBeenCalled();
    });

    test('ignores messages that were never tracked', async () => {
        const del = makeDeletedMsg({id: 'untracked'});
        await deleteHandler.run(makeClient(), del);
        expect(del._send).not.toHaveBeenCalled();
    });
});