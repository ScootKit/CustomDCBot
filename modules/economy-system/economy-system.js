/**
 * Basic functions for the economy system
 * @module economy-system
 * @author jateute
 */
const {embedType} = require('../../src/functions/helpers');

/**
 * add a User to DB
 * @param {Client} client Client
 * @param {string} id Id of the user
 * @returns {promise<void>}
 */
createUser = async function (client, id) {
    const moduleConfig = client.configurations['economy-system']['config'];
    client.models['economy-system']['Balace'].create({
        id: id,
        balance: moduleConfig['startMoney']
    });
    client.logger.debug(`[economy-system] Created model for the user with the Id ${id}`);
};

/**
 * Add/ Remove xyz from balance/ set balance to
 * @param {Client} client Client
 * @param {string} id UserId of the user which is effected
 * @param {string} action The action which is should be performed (add/ remove/ set)
 * @param {number} value The value which is added/ removed to/ from the balance/ to which the balance gets set
 * @returns {Promise<void>}
 */
balanceFunction = async function (client, id, action, value) {
    const user = client.models['economy-system']['Balance'].findOne({
        where: {
            id: id
        }
    });
    if (!user) {
        createUser(client, id);
    }
    switch (action) {
        case 'add':
            newBalance = parseInt(user.balance) + parseInt(value);
            user.balance = newBalance;
            user.save();
            break;

        case 'remove':
            newBalance = parseInt(user.balance) - parseInt(value);
            user.balance = newBalance;
            user.save();
            break;

        case 'set':
            user.balace = parseInt(value);
            user.save();
            break;

        default:
            client.logger.error(`[economy-system] ${action} This action is invalid`);
            break;
    }
};

/**
 * Function to create a new Item for the shop
 * @param {string} item The name of the item
 * @param {number} price The price of the item
 * @param {Role} role The role which is added to everyone who buys this item
 * @param {Client} client Client
 * @returns {Promise}
 */
createShopItem = async function (item, price, role, client) {
    return new Promise(async (resolve, reject) => {
        const model = client.models['economy-system']['Shop'];
        if (model.findAll({
            where: {
                name: item
            }
        })) {
            reject(`The item ${item} already exists!`);
        }
        model.create({
            name: item,
            price: price,
            role: role
        });
        resolve(`Created the item ${item} successfully`);
    });
};

/**
 * Function to delete a shop-item
 * @param {item} item The name of the item
 * @param {Client} client Client
 * @returns {Promise}
 */
deleteShopItem = async function (item, client) {
    return new Promise(async (resolve, reject) => {
        const model = client.models['economy-system']['Shop'].findOne({
            where: {
                name: item
            }
        });
        if (!model) {
            reject(`The item ${item} doesn't exists!`);
        }
        model.destroy();
        resolve(`Deleted the item ${item} successfully`);
    });
};

/**
 * Create the shop embed
 * @param {Client} client Client
 * @returns {object} Returns [messageOptions](https://discord.js.org/#/docs/main/stable/typedef/MessageOptions) for the shop
 */
createShopEmbed = async function (client) {
    const items = client.models['economy-system']['Shop'].findAll();
    const moduleStr = client.configurations['economy-system']['strings'];
    let string = '';
    for (const item of items) {
        string = string + `${item.name}: ${item.price}${client.configurations['economy-system']['config']['currencySymbol']}\n`;
    }
    shopEmbed = moduleStr['shopEmbed'];
    shopEmbed['fields'] = {
        name: 'items:',
        value: string
    };
    return embedType(shopEmbed);

};
module.exports.balance = balanceFunction;
module.exports.createUser = createUser;
module.exports.createShopItem = createShopItem;
module.exports.deleteShopItem = deleteShopItem;
module.exports.createShopEmbed = createShopEmbed;
