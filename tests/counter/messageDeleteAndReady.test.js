/*
 * Tests for the counter messageDelete protection handler and the botReady seeder.
 *
 * messageDelete: only fires when protectAgainstDeletion is on, the channel is a
 *   configured count channel, and the deleted message was the *current* count by
 *   the *last* counter; it then resends a protection notice. All guards covered.
 * botReady: creates a CountChannel row for each configured channel that does not
 *   yet have one, and leaves existing rows untouched.
 */
jest.mock('../../src/functions/helpers', () => ({embedType: (x) => ({content: x})}));

const del = require('../../modules/counter/events/messageDelete');
const botReady = require('../../modules/counter/events/botReady');

function makeClient({
                        object = null,
                        config = {},
                        channelExists = null
                    } = {}) {
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        logger: {debug: jest.fn()},
        configurations: {
            counter: {
                config: {
                    channels: ['c1'],
                    protectAgainstDeletion: true,
                    protectionMessage: 'PROTECT',
                    allowCharactersInMessage: false,
                    allowMaths: false,
                    ...config
                }
            }
        },
        models: {
            counter: {
                CountChannel: {
                    findOne: jest.fn().mockResolvedValue(object !== null ? object : channelExists),
                    create: jest.fn().mockResolvedValue()
                }
            }
        }
    };
}

function makeMsg({
                     content = '6',
                     authorId = 'u1',
                     channelId = 'c1'
                 } = {}) {
    return {
        content,
        guild: {id: 'g1'},
        author: {
            id: authorId,
            bot: false,
            toString: () => `<@${authorId}>`
        },
        member: {},
        channel: {
            id: channelId,
            send: jest.fn().mockResolvedValue()
        }
    };
}

describe('messageDelete protection', () => {
    test('resends a notice when the current count by the last user is deleted', async () => {
        const object = {
            currentNumber: 6,
            lastCountedUser: 'u1'
        };
        const client = makeClient({object});
        const msg = makeMsg({
            content: '6',
            authorId: 'u1'
        });
        await del.run(client, msg);
        expect(msg.channel.send).toHaveBeenCalledWith(expect.objectContaining({content: 'PROTECT'}));
    });

    test('does nothing when protectAgainstDeletion is off', async () => {
        const object = {
            currentNumber: 6,
            lastCountedUser: 'u1'
        };
        const client = makeClient({
            object,
            config: {protectAgainstDeletion: false}
        });
        const msg = makeMsg();
        await del.run(client, msg);
        expect(msg.channel.send).not.toHaveBeenCalled();
    });

    test('does not fire for a deletion that was not the current number', async () => {
        const object = {
            currentNumber: 6,
            lastCountedUser: 'u1'
        };
        const client = makeClient({object});
        const msg = makeMsg({
            content: '3',
            authorId: 'u1'
        });
        await del.run(client, msg);
        expect(msg.channel.send).not.toHaveBeenCalled();
    });

    test('does not fire when a different user deleted their message', async () => {
        const object = {
            currentNumber: 6,
            lastCountedUser: 'someoneElse'
        };
        const client = makeClient({object});
        const msg = makeMsg({
            content: '6',
            authorId: 'u1'
        });
        await del.run(client, msg);
        expect(msg.channel.send).not.toHaveBeenCalled();
    });

    test('ignores deletions in non-count channels', async () => {
        const client = makeClient({
            object: {
                currentNumber: 6,
                lastCountedUser: 'u1'
            }
        });
        const msg = makeMsg({channelId: 'other'});
        await del.run(client, msg);
        expect(client.models.counter.CountChannel.findOne).not.toHaveBeenCalled();
    });

    test('ignores bot authors', async () => {
        const client = makeClient({
            object: {
                currentNumber: 6,
                lastCountedUser: 'u1'
            }
        });
        const msg = makeMsg();
        msg.author.bot = true;
        await del.run(client, msg);
        expect(client.models.counter.CountChannel.findOne).not.toHaveBeenCalled();
    });
});

describe('botReady seeding', () => {
    test('creates a row for a channel with no existing entry', async () => {
        const client = makeClient({
            channelExists: null,
            config: {channels: ['c1']}
        });
        await botReady.run(client);
        expect(client.models.counter.CountChannel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                channelID: 'c1',
                currentNumber: 0,
                userCounts: {}
            })
        );
    });

    test('leaves existing channels untouched', async () => {
        const client = makeClient({channelExists: {channelID: 'c1'}});
        await botReady.run(client);
        expect(client.models.counter.CountChannel.create).not.toHaveBeenCalled();
    });
});