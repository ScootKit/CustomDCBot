/*
 * Tests for the interaction-driven shop CRUD helpers in economy-system.js:
 *   createShopItem: role-too-high guard, price<=0 guard, duplicate guard, and
 *     the create-and-confirm happy path.
 *   deleteShopItem: ambiguous-match, no-match, and the single-match destroy.
 *   updateShopItem: missing-id guard, item-not-found guard, the new-name
 *     collision guard, and applying new name/price/role to the row.
 * shopChannel is left empty so the side-effecting shopMsg() short-circuits.
 */
const eco = require('../../modules/economy-system/economy-system');

const STRINGS = {
    itemCreate: 'CREATE',
    itemDuplicate: 'DUP',
    itemDelete: 'DELETE',
    itemEdit: 'EDIT',
    multipleMatches: 'MULTI',
    noMatches: 'NOMATCH'
};

function makeInteraction({
                             options = {},
                             shopFindOne = null,
                             shopFindAll = [],
                             roleHigher = true
                         } = {}) {
    return {
        editReply: jest.fn().mockResolvedValue(),
        user: {tag: 'Admin#1'},
        guild: {members: {me: {roles: {highest: {comparePositionTo: () => (roleHigher ? 1 : -1)}}}}},
        options: {
            get: jest.fn((name) => (name in options ? {value: options[name]} : undefined)),
            getRole: jest.fn((name) => options[`role_${name}`] ?? null),
            getInteger: jest.fn((name) => (options[name] ?? null))
        },
        client: {
            logger: {info: jest.fn()},
            logChannel: null,
            configurations: {
                'economy-system': {
                    config: {
                        shopChannel: '',
                        currencySymbol: '$'
                    },
                    strings: STRINGS
                }
            },
            models: {
                'economy-system': {
                    Shop: {
                        findOne: jest.fn().mockResolvedValue(shopFindOne),
                        findAll: jest.fn().mockResolvedValue(shopFindAll),
                        create: jest.fn().mockResolvedValue()
                    }
                }
            }
        }
    };
}

describe('createShopItem', () => {
    function createInteraction(over = {}) {
        const {
            options: optOver,
            ...rest
        } = over;
        return makeInteraction({
            options: {
                'item-name': 'Sword',
                'item-id': 'sword',
                price: 10,
                role_role: {
                    id: 'role1',
                    name: 'VIP'
                }, ...optOver
            },
            ...rest
        });
    }

    test('rejects a role higher than the bot', async () => {
        const interaction = createInteraction({roleHigher: false});
        const res = await eco.createShopItem(interaction);
        expect(res).toContain('role-to-high');
        expect(interaction.client.models['economy-system'].Shop.create).not.toHaveBeenCalled();
    });

    test('rejects a non-positive price', async () => {
        const interaction = createInteraction({options: {price: 0}});
        const res = await eco.createShopItem(interaction);
        expect(res).toContain('price-less-than-zero');
    });

    test('rejects a duplicate item', async () => {
        const interaction = createInteraction({shopFindOne: {id: 'sword'}});
        const res = await eco.createShopItem(interaction);
        expect(res).toContain('item-duplicate');
        expect(interaction.client.models['economy-system'].Shop.create).not.toHaveBeenCalled();
    });

    test('creates the item and confirms', async () => {
        const interaction = createInteraction({shopFindOne: null});
        const res = await eco.createShopItem(interaction);
        expect(interaction.client.models['economy-system'].Shop.create).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'sword',
                name: 'Sword',
                price: 10,
                role: 'role1'
            })
        );
        expect(res).toContain('created-item');
    });
});

describe('deleteShopItem', () => {
    test('reports an ambiguous match', async () => {
        const interaction = makeInteraction({
            options: {
                'item-name': 'x',
                'item-id': 'y'
            },
            shopFindAll: [{}, {}]
        });
        await eco.deleteShopItem(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'MULTI'}));
    });

    test('reports no match', async () => {
        const interaction = makeInteraction({
            options: {'item-id': 'ghost'},
            shopFindAll: []
        });
        await eco.deleteShopItem(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'NOMATCH'}));
    });

    test('destroys a single match', async () => {
        const item = {
            name: 'Sword',
            id: 'sword',
            destroy: jest.fn().mockResolvedValue()
        };
        const interaction = makeInteraction({
            options: {'item-id': 'sword'},
            shopFindAll: [item]
        });
        await eco.deleteShopItem(interaction);
        expect(item.destroy).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'DELETE'}));
    });
});

describe('updateShopItem', () => {
    test('rejects a missing id', async () => {
        const interaction = makeInteraction({options: {'item-id': ''}});
        await eco.updateShopItem(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith('Please use the id!');
    });

    test('reports when the item is not found', async () => {
        const interaction = makeInteraction({
            options: {'item-id': 'ghost'},
            shopFindOne: null
        });
        await eco.updateShopItem(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'NOMATCH'}));
    });

    test('applies new name, price and role', async () => {
        const item = {
            id: 'sword',
            name: 'Old',
            price: 1,
            role: 'r0',
            save: jest.fn().mockResolvedValue()
        };
        const interaction = makeInteraction({
            options: {
                'item-id': 'sword',
                'item-new-name': 'New Name',
                'new-price': 99
            },
            shopFindOne: item
        });
        // wire getRole + getInteger to return the edit values
        interaction.options.getRole = jest.fn((name) => (name === 'new-role' ? {
            id: 'r9',
            name: 'R9'
        } : null));
        interaction.options.getInteger = jest.fn((name) => (name === 'new-price' ? 99 : null));
        // First findOne resolves the item being edited; the second (collision check) finds nothing.
        interaction.client.models['economy-system'].Shop.findOne = jest.fn()
            .mockResolvedValueOnce(item)
            .mockResolvedValueOnce(null);
        await eco.updateShopItem(interaction);
        expect(item.name).toBe('New Name');
        expect(item.price).toBe(99);
        expect(item.role).toBe('r9');
        expect(item.save).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'EDIT'}));
    });

    test('rejects a new name that collides with another item', async () => {
        const item = {
            id: 'sword',
            name: 'Old',
            price: 1,
            role: 'r0',
            save: jest.fn()
        };
        const interaction = makeInteraction({
            options: {
                'item-id': 'sword',
                'item-new-name': 'Taken'
            },
            shopFindOne: item
        });
        interaction.options.getRole = jest.fn(() => null);
        interaction.options.getInteger = jest.fn(() => null);
        // First findOne resolves the item; the second (collision check) finds a different item using the new name.
        interaction.client.models['economy-system'].Shop.findOne = jest.fn()
            .mockResolvedValueOnce(item)
            .mockResolvedValueOnce({id: 'other'});
        await eco.updateShopItem(interaction);
        expect(item.save).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: 'DUP'}));
    });
});