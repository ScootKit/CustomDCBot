/**
 * Basic functions for the economy system
 * @module economy-system
 * @author jateute
 */
const { MessageEmbed } = require('discord.js');

/**
 * add a User to DB
 * @param {Client} client Client
 * @param {string} id Id of the user
 * @returns {promise<void>}
 */
createUser = async function (client, id) {
    const moduleConfig = client.configurations['economy-system']['config'];
    client.models['economy-system']['Balance'].create({
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
    let user = await client.models['economy-system']['Balance'].findOne({
        where: {
            id: id
        }
    });
    if (!user) {
        await createUser(client, id);
        user = await client.models['economy-system']['Balance'].findOne({
            where: {
                id: id
            }
        });
    }
    let newBalance = 0;
    switch (action) {
        case 'add':
            newBalance = parseInt(user.balance) + parseInt(value);
            user.balance = newBalance;
            await user.save();
            await leaderboard(client);
            break;

        case 'remove':
            newBalance = parseInt(user.balance) - parseInt(value);
            if (newBalance <= 0) newBalance = 0;
            user.balance = newBalance;
            await user.save();
            await leaderboard(client);
            break;

        case 'set':
            user.balance = parseInt(value);
            await user.save();
            await leaderboard(client);
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
    return new Promise(async (resolve) => {
        const model = client.models['economy-system']['Shop'];
        const itemModel = await model.findOne({
            where: {
                name: item
            }
        });
        if (itemModel) {
            resolve(`The item ${item} already exists!`);
        } else {
            await model.create({
                name: item,
                price: price,
                role: role
            });
            resolve(`Created the item ${item} successfully`);
        }
    });
};

/**
 * Function to delete a shop-item
 * @param {item} item The name of the item
 * @param {Client} client Client
 * @returns {Promise}
 */
deleteShopItem = async function (item, client) {
    return new Promise(async (resolve) => {
        const model = await client.models['economy-system']['Shop'].findOne({
            where: {
                name: item
            }
        });
        if (!model) {
            resolve(`The item ${item} doesn't exists!`);
        } else {
            await model.destroy();
            resolve(`Deleted the item ${item} successfully`);
        }
    });
};

/**
 * Create the shop message
 * @param {Client} client Client
 * @returns {string}
 */
createShopMsg = async function (client) {
    const items = await client.models['economy-system']['Shop'].findAll();
    const moduleStr = client.configurations['economy-system']['strings'];
    let string = moduleStr['shopMsg'];
    for (let i = 0; i < items.length; i++) {
        string = `${string}\n**${items[i].dataValues.name}**: ${items[i].dataValues.price}${client.configurations['economy-system']['config']['currencySymbol']}`;
    }
    return string;

};

/**
 * Gets the ten users with the most money
 * @param {object} object Objetc of the users
 * @returns {array}
 * @private
 */
topTen = async function (object) {
    if (object.length === 0) return;
    object.sort(function (x, y) {
        return y.dataValues.balance - x.dataValues.balance;
    });
    let retStr = '';
    let items = 10;
    if (object.length < items) items = object.length;
    for (let i = 0; i < items; i++) {
        retStr = `${retStr}<@!${object[i].dataValues.id}>: ${object[i].dataValues.balance}\n`;
    }
    return retStr;
};

/**
 * Create/ update the money Leaderboard
 * @param {Client} client Client
 * @returns {promise<void>}
 */
leaderboard = async function (client) {
    const moduleConfig = client.configurations['economy-system']['config'];
    const moduleStr = client.configurations['economy-system']['strings'];
    const channel = await client.channels.fetch(moduleConfig['leaderboardChannel']).catch(() => {
    });
    if (!channel) return client.logger.fatal(`[economy-system] Can't find the channel with the ID ${moduleConfig['leaderboardChannel']}`);

    const model = await client.models['economy-system']['Balance'].findAll();

    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);

    const embed = new MessageEmbed()
        .setTitle(moduleStr['leaderboardEmbed']['title'])
        .setDescription(moduleStr['leaderboardEmbed']['description'])
        .setTimestamp()
        .setColor(moduleStr['leaderboardEmbed']['color'])
        .setAuthor(client.user.username, client.user.avatarURL())
        .setFooter(client.strings.footer, client.strings.footerImgUrl);

    if (model.length !== 0) embed.addField('Leaderboard:', await topTen(model));
    if (moduleStr['leaderboardEmbed']['thumbnail']) embed.setThumbnail(moduleStr['leaderboardEmbed']['thumbnail']);
    if (moduleStr['leaderboardEmbed']['image']) embed.setImage(moduleStr['leaderboardEmbed']['image']);

    if (messages.last()) await messages.last().edit({embeds: [embed]});
    else channel.send({embeds: [embed]});
};


module.exports.balance = balanceFunction;
module.exports.createUser = createUser;
module.exports.createShopItem = createShopItem;
module.exports.deleteShopItem = deleteShopItem;
module.exports.createShopMsg = createShopMsg;
module.exports.createleaderboard = leaderboard;
