/**
 * Basic functions for the economy system
 * @module economy-system
 * @author jateute
 */
const { MessageEmbed } = require('discord.js');
const {embedType} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');
const { Op } = require('sequelize');

/**
 * add a User to DB
 * @param {Client} client Client
 * @param {string} id Id of the user
 * @returns {promise<void>}
 */
async function createUser(client, id) {
    const moduleConfig = client.configurations['economy-system']['config'];
    client.models['economy-system']['Balance'].create({
        id: id,
        balance: 0,
        bank: moduleConfig['startMoney']
    });
}

/**
 * Add/ Remove xyz from balance/ set balance to
 * @param {Client} client Client
 * @param {string} id UserId of the user which is effected
 * @param {string} action The action which is should be performed (add/ remove/ set)
 * @param {number} value The value which is added/ removed to/ from the balance/ to which the balance gets set
 * @returns {Promise<void>}
 */
async function editBalance(client, id, action, value) {
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
}

/**
 * Function to edit the amount on the Bank of a user
 * @param {Client} client Client
 * @param {string} id UserId of the user which is effected
 * @param {string} action The action which is should be performed (deposit/ withdraw)
 * @param {number} value The value which is added/ removed to/ from the balance/ to which the balance gets set
 * @returns {Promise<void>}
 */
async function editBank(client, id, action, value) {
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
    let newBank = 0;
    switch (action) {
        case 'deposit':
            if (parseInt(user.balance) <= parseInt(value)) value = user.balance;
            newBank = parseInt(user.bank) + parseInt(value);
            user.bank = newBank;
            await user.save();
            editBalance(client, id, 'remove', value);
            await leaderboard(client);
            break;

        case 'withdraw':
            if (parseInt(value) >= parseInt(user.bank)) value = user.bank;
            newBank = parseInt(user.bank) - parseInt(value);
            if (newBank <= 0) newBank = 0;
            user.bank = newBank;
            await user.save();
            await editBalance(client, id, 'add', value);
            await leaderboard(client);
            break;

        default:
            client.logger.error(`[economy-system] ${action} This action is invalid`);
            break;
    }
}

/**
 * Function to create a new Item for the shop
 * @param {*} interaction Interaction (if you specify a name and ID, set this to an empty string)
 * @param {string} id The id of the item
 * @param {string} name The name of the item
 * @param {number} price The price of the item
 * @param {Role} role The role which is added to everyone who buys this item
 * @param {Client} client Client
 * @returns {Promise}
 */
async function createShopItem(interaction, pId, pName, pPrice, pRole, client) {
    return new Promise(async (resolve) => {
        if (interaction !== '') {
            const name = await interaction.options.get('itemname')['value'];
            const id = await interaction.options.get('itemId', true)['value'];
            const role = await interaction.options.getRole('role', true);
            const price = await interaction.options.getInteger('price');
            const model = interaction.client.models['economy-system']['Shop'];
            const itemModel = await model.findOne({
                where: {
                    [Op.or]: [
                        {name: name},
                        {id: id}
                    ]
                }
            });
            if (itemModel) {
                interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['itemDuplicate']));
                resolve(localize('economy-system', 'item-duplicate'));
            } else {
                await model.create({
                    id: id,
                    name: name,
                    price: price,
                    role: role
                });
                interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['itemCreate'], {
                    '%name%': name,
                    '%id%': id,
                    '%price%': price,
                    '%role%': role.name
                }, {ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']}));

                interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'created-item', {
                    u: interaction.user.tag,
                    n: name,
                    i: id
                }));
                if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'created-item', {
                    u: interaction.user.tag,
                    n: name,
                    i: id
                }));
                resolve(localize('economy-system', 'created-item'));
            }
        } else {
            const model = client.models['economy-system']['Shop'];
            const itemModel = await model.findOne({
                where: {
                    [Op.or]: [
                        {name: pName},
                        {id: pId}
                    ]
                }
            });
            if (itemModel) {
                resolve(localize('economy-system', 'item-duplicate'));
            } else {
                await model.create({
                    id: pId,
                    name: pName,
                    price: pPrice,
                    role: pRole
                });
                client.logger.info(`[economy-system] ` + localize('economy-system', 'created-item', {
                    u: 'API/ CLI',
                    n: pName,
                    i: pId
                }));
                if (client.logChannel) client.logChannel.send(`[economy-system] ` + localize('economy-system', 'created-item', {
                    u: 'API/ CLI',
                    n: pName,
                    i: pId
                }));
                resolve(localize('economy-system', 'created-item'));
            }
        }
    });
}

/**
 * Function to delete a shop-item
 * @param {*} interaction Interaction (if you specify a name or ID, set this to an empty string)
 * @param {string} pName Name of the item
 * @param {string} pId ID if the item
 * @returns {Promise}
 */
async function deleteShopItem(interaction, pName, pId, client) {
    return new Promise(async (resolve) => {
        if (interaction !== '') { // interaction mode
            const name = interaction.options.get('itemName')['value'];
            const id = interaction.options.get('itemId')['value'];
            const model = await interaction.client.models['economy-system']['Shop'].findAll({
                where: {
                    [Op.or]: [
                        {name: name},
                        {id: id}
                    ]
                }
            });
            if (model.length > 1) {
                await interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['multipleMatches'], {}, {ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']}));
                resolve();
            } else if (model.length < 1) {
                await interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['noMatches'], {'%id%': id, '%name%': name}, {ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']}));
                resolve();
            } else {
                await model[0].destroy();
                await interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['itemDelete'], {'%name%': model[0]['name'], '%id%': model[0]['id']}, {ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']}));
                interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'delete-item', {
                    u: interaction.user.tag,
                    i: name
                }));
                if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'delete-item', {
                    u: interaction.user.tag,
                    i: name
                }));
                resolve(`Deleted the item ${name} successfully`);
            }
        } else {
            if (!client) return resolve('Please pass a client');
            const model = await client.models['economy-system']['Shop'].findAll({
                where: {
                    [Op.or]: [
                        {name: pName},
                        {id: pId}
                    ]
                }
            });
            if (model.length > 1) {
                resolve('More than one item was found');
            } else if (model.length < 1) {
                resolve('No item was found');
            } else {
                await model[0].destroy();
                client.logger.info(`[economy-system] ` + localize('economy-system', 'delete-item', {
                    u: 'API/ CLI',
                    i: pName
                }));
                if (client.logChannel) client.logChannel.send(`[economy-system] ` + localize('economy-system', 'delete-item', {
                    u: 'API/ CLI',
                    i: pName
                }));
                resolve(`Deleted the item ${pName}/ ${pId} successfully`);
            }
        }
    });
}

/**
 * Create the shop message
 * @param {Client} client Client
 * @returns {string}
 */
async function createShopMsg(client) {
    const items = await client.models['economy-system']['Shop'].findAll();
    let string = '';
    for (let i = 0; i < items.length; i++) {
        string = `${string}**${items[i].dataValues.name}**: ${items[i].dataValues.price} ${client.configurations['economy-system']['config']['currencySymbol']}\n`;
    }
    return embedType(client.configurations['economy-system']['strings']['shopMsg'], {'%shopItems%': string}, { ephemeral: true });
}

/**
 * Gets the ten users with the most money
 * @param {object} object Objetc of the users
 * @param {Client} client Client
 * @returns {array}
 * @private
 */
async function topTen(object, client) {
    if (object.length === 0) return;
    object.sort(function (x, y) {
        return (y.dataValues.balance + y.dataValues.bank) - (x.dataValues.balance + x.dataValues.bank);
    });
    let retStr = '';
    let items = 10;
    if (object.length < items) items = object.length;
    for (let i = 0; i < items; i++) {
        retStr = `${retStr}<@!${object[i].dataValues.id}>: ${object[i].dataValues.balance + object[i].dataValues.bank} ${client.configurations['economy-system']['config']['currencySymbol']}\n`;
    }
    return retStr;
}

/**
 * Create/ update the money Leaderboard
 * @param {Client} client Client
 * @returns {promise<void>}
 */
async function leaderboard(client) {
    const moduleConfig = client.configurations['economy-system']['config'];
    const moduleStr = client.configurations['economy-system']['strings'];
    const channel = await client.channels.fetch(moduleConfig['leaderboardChannel']).catch(() => {
    });
    if (!channel) return client.logger.fatal(`[economy-system] ` + localize('economy-system', 'channel-not-found'));

    const model = await client.models['economy-system']['Balance'].findAll();

    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);

    const embed = new MessageEmbed()
        .setTitle(moduleStr['leaderboardEmbed']['title'])
        .setDescription(moduleStr['leaderboardEmbed']['description'])
        .setTimestamp()
        .setColor(moduleStr['leaderboardEmbed']['color'])
        .setAuthor({name: client.user.username, iconURL: client.user.avatarURL()})
        .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl});

    if (model.length !== 0) embed.addField('Leaderboard:', await topTen(model, client));
    if (moduleStr['leaderboardEmbed']['thumbnail']) embed.setThumbnail(moduleStr['leaderboardEmbed']['thumbnail']);
    if (moduleStr['leaderboardEmbed']['image']) embed.setImage(moduleStr['leaderboardEmbed']['image']);

    if (messages.last()) await messages.last().edit({embeds: [embed]});
    else channel.send({embeds: [embed]});
}


module.exports.editBalance = editBalance;
module.exports.editBank = editBank;
module.exports.createUser = createUser;
module.exports.createShopItem = createShopItem;
module.exports.deleteShopItem = deleteShopItem;
module.exports.createShopMsg = createShopMsg;
module.exports.createleaderboard = leaderboard;