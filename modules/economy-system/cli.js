const {balance, createShopItem, deleteShopItem} = require('../economy-system/economy-system');

module.exports.commands = [
    {
        command: 'add',
        description: 'Add xyz to the balance of a user. (args: 1. UserId, 2. amount to add)',
        run: function (input) {
            const client = input.client;
            const args = input.args;
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[1], 'add', parseInt(args[2]));
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] ${args[2]} has been added to the balance of the user ${args[1]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] ${args[2]} has been added to the balance of the user ${args[1]}`);
        }
    },
    {
        command: 'remove',
        description: 'Remove xyz fom the balance of a user. (args: 1. UserId, 2. amount to remove)',
        run: function (input) {
            const client = input.client;
            const args = input.args;
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[1], 'remove', parseInt(args[2]));
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] ${args[2]} has been removed from the balance of the user ${args[1]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] ${args[2]} has been removed from the balance of the user ${args[1]}`);
        }
    },
    {
        command: 'set',
        description: 'Set the balance of a user to xyz. (args: 1. UserId, 2. new balance)',
        run: function (input) {
            const client = input.client;
            const args = input.args;
            if (!client.configurations['economy-system']['config']['allowCheats']) return console.log('This command isn`t activated.');
            balance(client, args[1], 'set', parseInt(args[2]));
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] The balance of the user ${args[1]} has been set to ${args[2]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] The balance of the user ${args[1]} has been set to ${args[2]}`);
        }
    },
    {
        command: 'balance',
        description: 'Show all balances from the DataBase',
        run: async function (input) {
            const balances = await input.client.models['economy-system']['Balance'].findAll();
            const balanceArr = [];
            if (balances.length !== 0) {
                balances.sort(function (x, y) {
                    return y.dataValues.balance - x.dataValues.balance;
                });
                for (let i = 0; i < balances.length; i++) {
                    balanceArr.push({ id: balances[i].dataValues.id, balance: balances[i].dataValues.balance });
                }
            }
            console.table(balanceArr);
            input.client.logger.debug(`Receved CLI Command: ${input}`);
        }
    },
    {
        command: 'newShopItem',
        description: 'Creates a new shop item. (args: 1. name of the Item, 2. price of the item, 3. roleId for the role that everyone gets, who buys this item)',
        run: async function (input) {
            const client = input.client;
            const args = input.args;
            await createShopItem(args[1], args[2], client.roles.fetch(args[3]), client).then(
                async function (message) {
                    client.logger.debug(message);
                },
                async function (error) {
                    client.logger.debug(error);
                }
            );
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] The CLI has created a new shop-item with the name ${args[1]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] The CLI has created a new shop-item with the name ${args[1]}`);
        }
    },
    {
        command: 'deleteShopItem',
        description: 'Deletes a shop item (args: 1. Name of the item)',
        run: function (input) {
            const client = input.client;
            const args = input.args;
            deleteShopItem(args[1], client).then(
                async function (message) {
                    console.log(message);
                },
                async function (error) {
                    console.log(error);
                }
            );
            client.logger.debug(`Receved CLI Command: ${input}`);
            client.logger.info(`[economy-system] The CLI has deleted the shop-item with the name ${args[1]}`);
            if (client.logChannel) client.logChannel.send(`[economy-system] The CLI has deleted the shop-item with the name ${args[1]}`);
        }
    }
];