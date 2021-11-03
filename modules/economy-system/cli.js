const {balance, createShopItem, deleteShopItem} = require('../economy-system/economy-system');

module.exports.commands = [
    {
        command: 'add',
        description: 'Add xyz to the balance of a user. (args: 1. UserId, 2. amount to add)',
        run: function (input, args, client) {
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[0], 'add', parseInt(args[1]));
            client.logger.debug(`Receved CLI Command: ${input}`);
        }
    },
    {
        command: 'remove',
        description: 'Remove xyz fom the balance of a user. (args: 1. UserId, 2. amount to remove)',
        run: function (input, args, client) {
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[0], 'remove', parseInt(args[1]));
            client.logger.debug(`Receved CLI Command: ${input}`);
        }
    },
    {
        command: 'set',
        description: 'Set the balance of a user to xyz. (args: 1. UserId, 2. new balance)',
        run: function (input, args, client) {
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[0], 'set', parseInt(args[1]));
            client.logger.debug(`Receved CLI Command: ${input}`);
        }
    },
    {
        command: 'balace',
        description: 'Show all balances from the DataBase',
        run: function (input) {
            const balances = input.client.models['economy-system']['Balance'].findAll().sort(function (x, y) {
                return y.balance - x.balance;
            });
            console.table(balances);
        }
    },
    {
        command: 'newShopItem',
        description: 'Creates a new shop item. (args: 1. name of the Item, 2. price of the item, 3. roleId for the role that evryone gets, who buys this item)',
        run: function (input, args) {
            createShopItem(args[0], args[1], input.client.roles.fetch(args[2]), input.client).then(
                async function (message) {
                    console.log(message);
                },
                async function (error) {
                    console.log(error);
                }
            );
        }
    },
    {
        command: 'deleteShopItem',
        description: 'Deletes a shop item (args: 1. Name of the item)',
        run: function (input, args) {
            deleteShopItem(args[0], input.client).then(
                async function (message) {
                    console.log(message);
                },
                async function (error) {
                    console.log(error);
                }
            );
        }
    }
];