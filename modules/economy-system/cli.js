const {balance, createShopItem, deleteShopItem} = require('../economy-system/economy-system');

module.exports.commands = [
    {
        command: 'add',
        description: 'Add xyz to the balance of a user. (args: 1. UserId, 2. amount to add)',
        run: function (input, args, client) {
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[0], 'add', parseInt(args[1]));
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] ${args[1]} has been added to the balance of the user ${args[0]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] ${args[1]} has been added to the balance of the user ${args[0]}`);
        }
    },
    {
        command: 'remove',
        description: 'Remove xyz fom the balance of a user. (args: 1. UserId, 2. amount to remove)',
        run: function (input, args, client) {
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[0], 'remove', parseInt(args[1]));
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] ${args[1]} has been removed from the balance of the user ${args[0]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] ${args[1]} has been removed from the balance of the user ${args[0]}`);
        }
    },
    {
        command: 'set',
        description: 'Set the balance of a user to xyz. (args: 1. UserId, 2. new balance)',
        run: function (input, args, client) {
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[0], 'set', parseInt(args[1]));
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] The balance of the user ${args[0]} has been set to ${args[1]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] The balance of the user ${args[0]} has been set to ${args[1]}`);
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
            input.client.logger.debug(`Receved CLI Command: ${input}`);
        }
    },
    {
        command: 'newShopItem',
        description: 'Creates a new shop item. (args: 1. name of the Item, 2. price of the item, 3. roleId for the role that evryone gets, who buys this item)',
        run: function (input, args, client) {
            createShopItem(args[0], args[1], client.roles.fetch(args[2]), client).then(
                async function (message) {
                    console.log(message);
                },
                async function (error) {
                    console.log(error);
                }
            );
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] The CLI has created a new shop-item with the name ${args[0]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] The CLI has created a new shop-item with the name ${args[0]}`);
        }
    },
    {
        command: 'deleteShopItem',
        description: 'Deletes a shop item (args: 1. Name of the item)',
        run: function (input, args, client) {
            deleteShopItem(args[0], client).then(
                async function (message) {
                    console.log(message);
                },
                async function (error) {
                    console.log(error);
                }
            );
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] The CLI has deleted the shop-item with the name ${args[0]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] The CLI has deleted the shop-item with the name ${args[0]}`);
        }
    }
];