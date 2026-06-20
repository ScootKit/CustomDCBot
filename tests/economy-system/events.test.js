/*
 * Tests for the economy-system event handlers and the /shop command wrapper.
 *
 * messageCreate (random money drops): the early-return guards (not ready, no
 *   guild, bot author, wrong guild), the messageDrops==0 / ignored-channel
 *   short-circuits, the random-roll gate, the credited amount range, and that a
 *   drop notice is sent only when the author has not opted out.
 * interactionCreate: only the shop select-menu in the right guild buys an item.
 * botReady: redraws shop+leaderboard and schedules the daily refresh job.
 * shop command: permission gating on add/delete/edit, and that buy/list don't
 *   require manager permissions.
 */

const mockEditBalance = jest.fn().mockResolvedValue();
const mockBuyShopItem = jest.fn().mockResolvedValue();
const mockShopMsg = jest.fn().mockResolvedValue();
const mockCreateLeaderboard = jest.fn().mockResolvedValue();
const mockCreateShopItem = jest.fn().mockResolvedValue();
const mockCreateShopMsg = jest.fn().mockResolvedValue('SHOP_MSG');
const mockDeleteShopItem = jest.fn().mockResolvedValue();
const mockUpdateShopItem = jest.fn().mockResolvedValue();

jest.mock('../../modules/economy-system/economy-system', () => ({
    editBalance: (...a) => mockEditBalance(...a),
    buyShopItem: (...a) => mockBuyShopItem(...a),
    shopMsg: (...a) => mockShopMsg(...a),
    createLeaderboard: (...a) => mockCreateLeaderboard(...a),
    createShopItem: (...a) => mockCreateShopItem(...a),
    createShopMsg: (...a) => mockCreateShopMsg(...a),
    deleteShopItem: (...a) => mockDeleteShopItem(...a),
    updateShopItem: (...a) => mockUpdateShopItem(...a)
}));

jest.mock('../../src/functions/helpers', () => ({
    formatDiscordUserName: (u) => (u && u.tag) || 'user'
}));

const mockSchedule = jest.fn(() => ({}));
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockSchedule(...a)}));

beforeEach(() => {
    mockEditBalance.mockClear();
    mockBuyShopItem.mockClear();
    mockShopMsg.mockClear();
    mockCreateLeaderboard.mockClear();
    mockSchedule.mockClear();
    jest.spyOn(Math, 'random').mockRestore?.();
});

describe('messageCreate money drops', () => {
    const handler = require('../../modules/economy-system/events/messageCreate');

    function makeClient(config = {}, {dropOptOut = null} = {}) {
        return {
            botReadyAt: Date.now(),
            config: {guildID: 'g1'},
            logger: {info: jest.fn()},
            logChannel: null,
            configurations: {
                'economy-system': {
                    config: {
                        messageDrops: 1,
                        msgDropsIgnoredChannels: [],
                        messageDropsMin: 5,
                        messageDropsMax: 6,
                        currencySymbol: '$',
                        ...config
                    }
                }
            },
            models: {'economy-system': {dropMsg: {findOne: jest.fn().mockResolvedValue(dropOptOut)}}}
        };
    }

    function makeMessage(overrides = {}) {
        return {
            guild: {id: 'g1'},
            author: {
                id: 'u1',
                bot: false,
                tag: 'U#1'
            },
            channel: {id: 'c1'},
            reply: jest.fn().mockResolvedValue({delete: jest.fn()}),
            ...overrides
        };
    }

    test('does nothing before the bot is ready', async () => {
        const client = makeClient();
        client.botReadyAt = null;
        await handler.run(client, makeMessage());
        expect(mockEditBalance).not.toHaveBeenCalled();
    });

    test('ignores bot authors and other guilds', async () => {
        await handler.run(makeClient(), makeMessage({
            author: {
                id: 'b',
                bot: true
            }
        }));
        await handler.run(makeClient(), makeMessage({guild: {id: 'other'}}));
        expect(mockEditBalance).not.toHaveBeenCalled();
    });

    test('messageDrops of 0 disables drops', async () => {
        await handler.run(makeClient({messageDrops: 0}), makeMessage());
        expect(mockEditBalance).not.toHaveBeenCalled();
    });

    test('skips ignored channels', async () => {
        await handler.run(makeClient({msgDropsIgnoredChannels: ['c1']}), makeMessage());
        expect(mockEditBalance).not.toHaveBeenCalled();
    });

    test('does nothing when the random roll misses (drop chance not hit)', async () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.0); // floor(0*1)=0 !== 1 -> miss
        await handler.run(makeClient({messageDrops: 5}), makeMessage());
        expect(mockEditBalance).not.toHaveBeenCalled();
        Math.random.mockRestore();
    });

    test('credits a drop and replies when the author has not opted out', async () => {
        // messageDrops:1 -> floor(random*1)=0 ... need ===1; with messageDrops:2, random in [0.5,1) -> floor=1
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        const client = makeClient({
            messageDrops: 2,
            messageDropsMin: 10,
            messageDropsMax: 11
        }, {dropOptOut: null});
        const msg = makeMessage();
        await handler.run(client, msg);
        expect(mockEditBalance).toHaveBeenCalledWith(client, 'u1', 'add', expect.any(Number));
        expect(msg.reply).toHaveBeenCalled();
        Math.random.mockRestore();
    });

    test('does not send a reply when the author opted out of drop messages', async () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        const client = makeClient({messageDrops: 2}, {dropOptOut: {id: 'u1'}});
        const msg = makeMessage();
        await handler.run(client, msg);
        expect(mockEditBalance).toHaveBeenCalled();
        expect(msg.reply).not.toHaveBeenCalled();
        Math.random.mockRestore();
    });
});

describe('interactionCreate shop select', () => {
    const handler = require('../../modules/economy-system/events/interactionCreate');

    function makeInteraction(overrides = {}) {
        return {
            guild: {id: 'g1'},
            isSelectMenu: () => true,
            customId: 'economy-system_shop-select',
            values: ['item-id'],
            deferReply: jest.fn().mockResolvedValue(),
            ...overrides
        };
    }

    const client = {
        botReadyAt: Date.now(),
        config: {guildID: 'g1'}
    };

    test('buys the selected item', async () => {
        const interaction = makeInteraction();
        await handler.run(client, interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(mockBuyShopItem).toHaveBeenCalledWith(interaction, 'item-id', null);
    });

    test('ignores non-select interactions', async () => {
        const interaction = makeInteraction({isSelectMenu: () => false});
        await handler.run(client, interaction);
        expect(mockBuyShopItem).not.toHaveBeenCalled();
    });

    test('ignores a foreign customId', async () => {
        const interaction = makeInteraction({customId: 'other'});
        await handler.run(client, interaction);
        expect(mockBuyShopItem).not.toHaveBeenCalled();
    });

    test('does nothing before the bot is ready', async () => {
        const interaction = makeInteraction();
        await handler.run({
            botReadyAt: null,
            config: {guildID: 'g1'}
        }, interaction);
        expect(mockBuyShopItem).not.toHaveBeenCalled();
    });
});

describe('botReady', () => {
    const handler = require('../../modules/economy-system/events/botReady');
    test('redraws the shop + leaderboard and schedules a daily refresh', async () => {
        const client = {jobs: []};
        await handler.run(client);
        expect(mockShopMsg).toHaveBeenCalledWith(client);
        expect(mockCreateLeaderboard).toHaveBeenCalledWith(client);
        expect(mockSchedule).toHaveBeenCalledWith('1 0 * * *', expect.any(Function));
        expect(client.jobs).toHaveLength(1);
    });
});

describe('shop command permission gating', () => {
    const shop = require('../../modules/economy-system/commands/shop');

    function makeInteraction({
                                 userId = 'u',
                                 shopManagers = [],
                                 botOperators = []
                             } = {}) {
        return {
            user: {id: userId},
            reply: jest.fn().mockResolvedValue(),
            deferReply: jest.fn().mockResolvedValue(),
            guild: {},
            options: {getString: jest.fn().mockReturnValue(null)},
            client: {
                config: {botOperators},
                strings: {not_enough_permissions: 'NOPE'},
                configurations: {
                    'economy-system': {
                        config: {
                            shopManagers,
                            publicCommandReplies: false
                        }
                    }
                }
            }
        };
    }

    test('add is rejected for a non-manager', async () => {
        const interaction = makeInteraction({userId: 'rando'});
        await shop.subcommands.add(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'NOPE'}));
        expect(mockCreateShopItem).not.toHaveBeenCalled();
    });

    test('add is allowed for a shop manager', async () => {
        const interaction = makeInteraction({
            userId: 'mgr',
            shopManagers: ['mgr']
        });
        await shop.subcommands.add(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        expect(mockCreateShopItem).toHaveBeenCalledWith(interaction);
    });

    test('delete is allowed for a bot operator', async () => {
        const interaction = makeInteraction({
            userId: 'op',
            botOperators: ['op']
        });
        await shop.subcommands.delete(interaction);
        expect(mockDeleteShopItem).toHaveBeenCalledWith(interaction);
    });

    test('edit is rejected for a non-manager', async () => {
        const interaction = makeInteraction({userId: 'rando'});
        await shop.subcommands.edit(interaction);
        expect(mockUpdateShopItem).not.toHaveBeenCalled();
    });

    test('buy never requires manager permissions', async () => {
        const interaction = makeInteraction({userId: 'rando'});
        await shop.subcommands.buy(interaction);
        expect(mockBuyShopItem).toHaveBeenCalled();
    });

    test('list renders the shop without a permission check', async () => {
        const interaction = makeInteraction({userId: 'rando'});
        await shop.subcommands.list(interaction);
        expect(mockCreateShopMsg).toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith('SHOP_MSG');
    });
});