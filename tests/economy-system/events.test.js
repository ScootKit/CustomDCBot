/*
 * Tests for the economy-system event handlers and the /shop command wrapper.
 *
 * messageCreate (random money drops): the early-return guards (not ready, no
 *   guild, bot author, wrong guild), the messageDrops==0 / ignored-channel
 *   short-circuits, the random-roll gate, the credited amount range, and that a
 *   drop notice is sent only when the author has not opted out. The notice comes
 *   from the configured msgDropMsg strings, falling back to the localized text
 *   when that config is missing or empty.
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

// Real RNG (so the genuine drop-chance / payout maths runs); embedType is a
// passthrough that renders the placeholders so assertions read as plain text.
// mockRandomIntFromInterval lets a single test force a deterministic roll.
let mockRandomIntFromInterval = null;
jest.mock('../../src/functions/helpers', () => {
    const actual = jest.requireActual('../../src/functions/helpers');
    return {
        ...actual,
        randomIntFromInterval: (...a) => (mockRandomIntFromInterval || actual.randomIntFromInterval)(...a),
        embedType: (input, args, opts) => {
            let content = input;
            for (const [k, v] of Object.entries(args || {})) content = content.split(k).join(v);
            return {
                content,
                ...opts
            };
        },
        formatDiscordUserName: (u) => (u && u.tag) || 'user'
    };
});

const mockSchedule = jest.fn(() => ({}));
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockSchedule(...a)}));

beforeEach(() => {
    mockEditBalance.mockClear();
    mockBuyShopItem.mockClear();
    mockShopMsg.mockClear();
    mockCreateLeaderboard.mockClear();
    mockSchedule.mockClear();
    mockRandomIntFromInterval = null;
});

describe('messageCreate money drops', () => {
    const handler = require('../../modules/economy-system/events/messageCreate');

    function makeClient(config = {}, {
        dropOptOut = null,
        strings = {}
    } = {}) {
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
                    },
                    strings: {
                        msgDropMsg: ['Message-Drop: You earned %earned% simply by chatting!'],
                        ...strings
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
        mockRandomIntFromInterval = () => 2; // roll !== 1 -> miss
        await handler.run(makeClient({messageDrops: 5}), makeMessage());
        expect(mockEditBalance).not.toHaveBeenCalled();
    });

    test('a chance of 1 drops on every single message', async () => {
        // REGRESSION: floor(random()*1) is always 0 and never 1, so a configured
        // 1/1 (100%) chance used to drop NEVER. The roll is now a 1/N interval,
        // so N=1 always hits. 25 consecutive messages must all drop.
        for (let i = 0; i < 25; i++) {
            mockEditBalance.mockClear();
            await handler.run(makeClient({messageDrops: 1}), makeMessage());
            expect(mockEditBalance).toHaveBeenCalled();
        }
    });

    test('credits a drop and replies when the author has not opted out', async () => {
        const client = makeClient({
            messageDrops: 1,
            messageDropsMin: 10,
            messageDropsMax: 11
        }, {dropOptOut: null});
        const msg = makeMessage();
        await handler.run(client, msg);
        expect(mockEditBalance).toHaveBeenCalledWith(client, 'u1', 'add', expect.any(Number));
        expect(msg.reply).toHaveBeenCalled();
    });

    test('replies with the configured msgDropMsg, not a hardcoded string', async () => {
        const client = makeClient({
            messageDrops: 1,
            messageDropsMin: 10,
            messageDropsMax: 10
        }, {strings: {msgDropMsg: ['CUSTOM %earned%']}});
        const msg = makeMessage();
        await handler.run(client, msg);
        expect(msg.reply).toHaveBeenCalledWith(expect.objectContaining({content: 'CUSTOM 10 $'}));
    });

    test('picks a random element when msgDropMsg holds multiple entries', async () => {
        // 3 entries, 60 drops: P(some entry never picked) < 3*(2/3)^60 ~ 1e-10.
        const seen = new Set();
        for (let i = 0; i < 60; i++) {
            const client = makeClient({
                messageDrops: 1,
                messageDropsMin: 10,
                messageDropsMax: 10
            }, {
                strings: {
                    msgDropMsg: [
                        'A %earned%',
                        'B %earned%',
                        'C %earned%'
                    ]
                }
            });
            const msg = makeMessage();
            await handler.run(client, msg);
            seen.add(msg.reply.mock.calls[0][0].content);
        }
        expect([...seen].sort()).toEqual([
            'A 10 $',
            'B 10 $',
            'C 10 $'
        ]);
    });

    test.each([
        ['missing', undefined],
        ['empty', []]
    ])('falls back to the localized drop notice when msgDropMsg is %s', async (_label, msgDropMsg) => {
        // randomElementFromArray([]) returns null and embedType(null) would throw,
        // so configs predating msgDropMsg (or with a cleared array) must still send.
        const client = makeClient({messageDrops: 1}, {strings: {msgDropMsg}});
        const msg = makeMessage();
        await handler.run(client, msg);
        expect(msg.reply).toHaveBeenCalledWith({content: expect.any(String)});
        expect(msg.reply.mock.calls[0][0].content).not.toBe('');
    });

    test('the credited amount spans the full inclusive [min,max]', async () => {
        // REGRESSION: floor(random()*(max-min))+min excluded max entirely. The roll
        // is now inclusive on both ends. min=5,max=6 => 2 outcomes; over 200 drops
        // P(an endpoint never appears) = 2*(1/2)^200 ~ 1e-60, so this cannot flake.
        const seen = new Set();
        for (let i = 0; i < 200; i++) {
            mockEditBalance.mockClear();
            await handler.run(makeClient({messageDrops: 1}), makeMessage());
            const amount = mockEditBalance.mock.calls[0][3];
            expect(amount).toBeGreaterThanOrEqual(5);
            expect(amount).toBeLessThanOrEqual(6);
            expect(Number.isInteger(amount)).toBe(true);
            seen.add(amount);
        }
        expect([...seen].sort()).toEqual([5, 6]);
    });

    test('does not send a reply when the author opted out of drop messages', async () => {
        const client = makeClient({messageDrops: 1}, {dropOptOut: {id: 'u1'}});
        const msg = makeMessage();
        await handler.run(client, msg);
        expect(mockEditBalance).toHaveBeenCalled();
        expect(msg.reply).not.toHaveBeenCalled();
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