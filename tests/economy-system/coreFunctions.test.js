/*
 * Tests for the economy-system core (modules/economy-system/economy-system.js)
 * beyond the balance maths already covered by balanceMath.test.js:
 *   - getUser/createUser: lazy creation of a Balance row seeded with startMoney
 *   - buyShopItem: not-found / ambiguous-match / already-owned / too-poor guards
 *     and the happy path (grant role, charge price)
 *   - createShopItemAPI / deleteShopItemAPI: duplicate + missing-item handling
 *   - createShopMsg: renders the item string + a select menu only when items exist
 *
 * The Discord/DB surface is mocked; leaderboardChannel/shopChannel are left
 * empty so the side-effecting leaderboard()/shopMsg() short-circuit.
 */

const eco = require('../../modules/economy-system/economy-system');

function makeClient({
                        balanceRows = [],
                        shopItems = [],
                        shopFindOne = undefined
                    } = {}) {
    const byId = new Map(balanceRows.map((r) => [r.id, r]));
    return {
        logger: {
            info: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn()
        },
        logChannel: null,
        configurations: {
            'economy-system': {
                config: {
                    leaderboardChannel: '',
                    shopChannel: '',
                    currencySymbol: '$',
                    startMoney: 250
                },
                strings: {
                    itemCreate: 'CREATE',
                    itemDuplicate: 'DUP',
                    notFound: 'NF',
                    multipleMatches: 'MULTI',
                    rebuyItem: 'REBUY',
                    notEnoughMoney: 'POOR',
                    buyMsg: 'BUY',
                    itemString: '%itemName% - %price%',
                    shopMsg: 'SHOP %shopItems%'
                }
            }
        },
        models: {
            'economy-system': {
                Balance: {
                    findOne: jest.fn(({where}) => Promise.resolve(byId.get(where.id) || null)),
                    create: jest.fn((row) => {
                        byId.set(row.id, {
                            ...row,
                            save: jest.fn().mockResolvedValue()
                        });
                        return Promise.resolve();
                    }),
                    findAll: jest.fn().mockResolvedValue(balanceRows)
                },
                Shop: {
                    findOne: jest.fn().mockResolvedValue(shopFindOne === undefined ? null : shopFindOne),
                    findAll: jest.fn().mockResolvedValue(shopItems),
                    create: jest.fn().mockResolvedValue()
                }
            }
        }
    };
}

describe('getUser / createUser', () => {
    test('returns an existing balance row without creating one', async () => {
        const row = {
            id: 'u1',
            balance: 5,
            bank: 0
        };
        const client = makeClient({balanceRows: [row]});
        const got = await eco.getUser(client, 'u1');
        expect(got).toBe(row);
        expect(client.models['economy-system'].Balance.create).not.toHaveBeenCalled();
    });

    test('creates a fresh row seeded with startMoney in the bank when missing', async () => {
        const client = makeClient({balanceRows: []});
        await eco.getUser(client, 'new');
        expect(client.models['economy-system'].Balance.create).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'new',
                balance: 0,
                bank: 250
            })
        );
    });
});

function makeShopInteraction({
                                 item,
                                 balance,
                                 memberHasRole = false
                             } = {}) {
    const editReply = jest.fn().mockResolvedValue();
    return {
        editReply,
        user: {
            id: 'buyer',
            tag: 'Buyer#1'
        },
        member: {
            roles: {
                cache: {has: () => memberHasRole},
                add: jest.fn().mockResolvedValue()
            }
        },
        client: {
            logger: {info: jest.fn()},
            logChannel: null,
            configurations: {
                'economy-system': {
                    config: {
                        leaderboardChannel: '',
                        shopChannel: '',
                        currencySymbol: '$',
                        startMoney: 0
                    },
                    strings: {
                        notFound: 'NF',
                        multipleMatches: 'MULTI',
                        rebuyItem: 'REBUY',
                        notEnoughMoney: 'POOR',
                        buyMsg: 'BUY',
                        itemString: 'x',
                        shopMsg: 'SHOP %shopItems%'
                    }
                }
            },
            models: {
                'economy-system': {
                    Shop: {findAll: jest.fn().mockResolvedValue(item ? [].concat(item) : [])},
                    Balance: {
                        findOne: jest.fn().mockResolvedValue(balance === undefined ? null : {
                            id: 'buyer',
                            balance,
                            bank: 0,
                            save: jest.fn().mockResolvedValue()
                        }),
                        create: jest.fn().mockResolvedValue()
                    }
                }
            }
        }
    };
}

describe('buyShopItem', () => {
    test('replies notFound when no item matches', async () => {
        const interaction = makeShopInteraction({item: null});
        await eco.buyShopItem(interaction, 'x', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'NF'}));
    });

    test('replies multipleMatches when the query is ambiguous', async () => {
        const interaction = makeShopInteraction({
            item: [{
                id: 'a',
                role: 'r',
                price: 1,
                name: 'A'
            }, {
                id: 'b',
                role: 'r2',
                price: 1,
                name: 'B'
            }]
        });
        await eco.buyShopItem(interaction, null, 'dup');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'MULTI'}));
    });

    test('rejects re-buying an item the member already owns', async () => {
        const interaction = makeShopInteraction({
            item: {
                id: 'a',
                role: 'role-a',
                price: 10,
                name: 'A'
            },
            memberHasRole: true
        });
        await eco.buyShopItem(interaction, 'a', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'REBUY'}));
        expect(interaction.member.roles.add).not.toHaveBeenCalled();
    });

    test('rejects when the buyer cannot afford the item', async () => {
        const interaction = makeShopInteraction({
            item: {
                id: 'a',
                role: 'role-a',
                price: 100,
                name: 'A'
            },
            balance: 50
        });
        await eco.buyShopItem(interaction, 'a', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'POOR'}));
    });

    test('grants the role and confirms when the buyer can afford it', async () => {
        const interaction = makeShopInteraction({
            item: {
                id: 'a',
                role: 'role-a',
                price: 30,
                name: 'Cool'
            },
            balance: 100
        });
        await eco.buyShopItem(interaction, 'a', null);
        expect(interaction.member.roles.add).toHaveBeenCalledWith('role-a');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'BUY'}));
    });

    test('returns early for a falsy interaction', async () => {
        await expect(eco.buyShopItem(null, 'a', null)).resolves.toBeUndefined();
    });
});

describe('createShopItemAPI', () => {
    test('resolves with the duplicate message when an item already exists', async () => {
        const client = makeClient({shopFindOne: {id: 'a'}});
        const res = await eco.createShopItemAPI('a', 'Name', 10, 'role', client);
        expect(res).toContain('item-duplicate');
        expect(client.models['economy-system'].Shop.create).not.toHaveBeenCalled();
    });

    test('creates the item and resolves with the created message when unique', async () => {
        const client = makeClient({shopFindOne: null});
        const res = await eco.createShopItemAPI('a', 'Name', 10, 'role', client);
        expect(client.models['economy-system'].Shop.create).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'a',
                name: 'Name',
                price: 10,
                role: 'role'
            })
        );
        expect(res).toContain('created-item');
    });
});

describe('deleteShopItemAPI', () => {
    function clientWith(items) {
        const client = makeClient();
        client.models['economy-system'].Shop.findAll = jest.fn().mockResolvedValue(items);
        return client;
    }

    test('reports when more than one item matches', async () => {
        const res = await eco.deleteShopItemAPI('n', 'i', clientWith([{}, {}]));
        expect(res).toBe('More than one item was found');
    });

    test('reports when no item matches', async () => {
        const res = await eco.deleteShopItemAPI('n', 'i', clientWith([]));
        expect(res).toBe('No item was found');
    });

    test('destroys the single matching item', async () => {
        const item = {destroy: jest.fn().mockResolvedValue()};
        const res = await eco.deleteShopItemAPI('Name', 'id', clientWith([item]));
        expect(item.destroy).toHaveBeenCalled();
        expect(res).toContain('successfully');
    });
});

describe('createShopMsg', () => {
    function guildWith(memberSize) {
        return {roles: {fetch: jest.fn().mockResolvedValue({members: {size: memberSize}})}};
    }

    test('renders a select menu component when items exist', async () => {
        const items = [{
            dataValues: {
                id: 'i1',
                name: 'Sword',
                price: 5,
                role: 'r1'
            }
        }];
        const client = makeClient({shopItems: items});
        const out = await eco.createShopMsg(client, guildWith(3), true);
        // embedType returns the optionsToKeep object for string input
        expect(out.components).toHaveLength(1);
        expect(out.components[0].components[0].options[0].value).toBe('i1');
        expect(out.content).toContain('Sword');
    });

    test('omits components when there are no items', async () => {
        const client = makeClient({shopItems: []});
        const out = await eco.createShopMsg(client, guildWith(0), false);
        expect(out.components).toEqual([]);
    });
});