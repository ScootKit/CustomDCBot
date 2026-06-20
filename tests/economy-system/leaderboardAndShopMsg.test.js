/*
 * Tests for the channel-publishing side effects in economy-system.js:
 *   createLeaderboard: short-circuits when no leaderboardChannel is set, logs
 *     fatal + bails when the channel can't be fetched, edits the last bot
 *     message when one exists, otherwise sends a fresh embed.
 *   shopMsg: short-circuits without a shopChannel, edits/sends the shop message.
 * The Discord client + message collection are mocked.
 */
const eco = require('../../modules/economy-system/economy-system');

function makeMessages(botMessages) {
    // Mimic a discord.js Collection.filter(...).last()
    return {
        filter: () => ({last: () => botMessages[botMessages.length - 1] || undefined})
    };
}

function makeClient({
                        leaderboardChannel = '',
                        shopChannel = '',
                        channel = null,
                        balanceRows = [],
                        shopItems = []
                    } = {}) {
    return {
        user: {
            id: 'bot',
            username: 'Bot',
            avatarURL: () => 'https://cdn.example.com/a.png'
        },
        strings: {
            footer: 'f',
            footerImgUrl: undefined,
            disableFooterTimestamp: false
        },
        logger: {
            fatal: jest.fn(),
            error: jest.fn(),
            info: jest.fn()
        },
        configurations: {
            'economy-system': {
                config: {
                    leaderboardChannel,
                    shopChannel,
                    currencySymbol: '$',
                    startMoney: 0
                },
                strings: {
                    leaderboardEmbed: {
                        title: 'T',
                        description: 'D',
                        color: 'GREEN',
                        thumbnail: '',
                        image: ''
                    },
                    itemString: '%itemName%',
                    shopMsg: 'SHOP %shopItems%'
                }
            }
        },
        channels: {fetch: jest.fn().mockResolvedValue(channel)},
        models: {
            'economy-system': {
                Balance: {findAll: jest.fn().mockResolvedValue(balanceRows)},
                Shop: {findAll: jest.fn().mockResolvedValue(shopItems)}
            }
        }
    };
}

describe('createLeaderboard', () => {
    test('does nothing when no leaderboard channel is configured', async () => {
        const client = makeClient({leaderboardChannel: ''});
        await eco.createLeaderboard(client);
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('logs fatal and bails when the channel cannot be fetched', async () => {
        const client = makeClient({
            leaderboardChannel: 'lb',
            channel: null
        });
        await eco.createLeaderboard(client);
        expect(client.logger.fatal).toHaveBeenCalled();
    });

    test('sends a fresh embed when there is no previous bot message', async () => {
        const channel = {
            messages: {fetch: jest.fn().mockResolvedValue(makeMessages([]))},
            send: jest.fn().mockResolvedValue()
        };
        const client = makeClient({
            leaderboardChannel: 'lb',
            channel,
            balanceRows: [{
                dataValues: {
                    id: 'u1',
                    balance: 10,
                    bank: 5
                }
            }]
        });
        await eco.createLeaderboard(client);
        expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({embeds: expect.any(Array)}));
    });

    test('edits the existing bot leaderboard message when present', async () => {
        const lastMsg = {edit: jest.fn().mockResolvedValue()};
        const channel = {
            messages: {fetch: jest.fn().mockResolvedValue(makeMessages([lastMsg]))},
            send: jest.fn().mockResolvedValue()
        };
        const client = makeClient({
            leaderboardChannel: 'lb',
            channel,
            balanceRows: [{
                dataValues: {
                    id: 'u1',
                    balance: 10,
                    bank: 5
                }
            }]
        });
        await eco.createLeaderboard(client);
        expect(lastMsg.edit).toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
    });
});

describe('shopMsg', () => {
    test('does nothing without a shop channel', async () => {
        const client = makeClient({shopChannel: ''});
        await eco.shopMsg(client);
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('sends a fresh shop message when none exists', async () => {
        const channel = {
            guild: {roles: {fetch: jest.fn().mockResolvedValue({members: {size: 0}})}},
            messages: {fetch: jest.fn().mockResolvedValue(makeMessages([]))},
            send: jest.fn().mockResolvedValue()
        };
        const client = makeClient({
            shopChannel: 'sc',
            channel,
            shopItems: []
        });
        await eco.shopMsg(client);
        expect(channel.send).toHaveBeenCalled();
    });

    test('edits the existing shop message when present', async () => {
        const lastMsg = {edit: jest.fn().mockResolvedValue()};
        const channel = {
            guild: {roles: {fetch: jest.fn().mockResolvedValue({members: {size: 1}})}},
            messages: {fetch: jest.fn().mockResolvedValue(makeMessages([lastMsg]))},
            send: jest.fn().mockResolvedValue()
        };
        const client = makeClient({
            shopChannel: 'sc',
            channel,
            shopItems: []
        });
        await eco.shopMsg(client);
        expect(lastMsg.edit).toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
    });
});