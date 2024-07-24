/**
 * Basic functions for the economy system
 * @module economy-system
 * @author jateute
 */
const { MessageEmbed } = require('discord.js');
const {embedType, inputReplacer} = require('../../src/functions/helpers');
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
 * Trys to find a user and if the user doesn't exists, creates the user
 * @param {Client} client client
 * @param {string} id ID of the user
 * @returns {Promise<Model|null>}
 */
async function getUser(client, id) {
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
    return user;
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
    const user = await getUser(client, id);
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
    const user = await getUser(client, id);
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
 * @param {string} pId The id of the item
 * @param {string} pName The name of the item
 * @param {number} pPrice The price of the item
 * @param {Role} pRole The role which is added to everyone who buys this item
 * @param {Client} client Client
 * @returns {Promise}
 */
async function createShopItemAPI(pId, pName, pPrice, pRole, client) {
    return new Promise(async (resolve) => {
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
            await shopMsg(client);
            resolve(localize('economy-system', 'created-item'));
        }
    });
}

/**
 * Function to create a new Item for the shop
 * @param {*} interaction Interaction
 * @returns {Promise}
 */
async function createShopItem(interaction) {
    return new Promise(async (resolve) => {
        const name = await interaction.options.get('item-name')['value'];
        const id = await interaction.options.get('item-id', true)['value'];
        const role = await interaction.options.getRole('role', true);
        const price = await interaction.options.getInteger('price');
        const model = interaction.client.models['economy-system']['Shop'];
        if (interaction.guild.me.roles.highest.comparePositionTo(role) <= 0) return interaction.reply(localize('economy-system', 'role-to-high'));
        const itemModel = await model.findOne({
            where: {
                [Op.or]: [
                    {name: name},
                    {id: id}
                ]
            }
        });
        if (itemModel) {
            interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['itemDuplicate'], {
                '%id%': id,
                '%name%': name
            }, {ephemeral: interaction.client.configurations['economy-system']['config']['publicCommandReplies']}));
            resolve(localize('economy-system', 'item-duplicate'));
        } else {
            await model.create({
                id: id,
                name: name,
                price: price,
                role: role['id']
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
            await shopMsg(interaction.client);
            resolve(localize('economy-system', 'created-item'));
        }
    });
}

/**
 * Function to buy an item
 * @param {*} interaction Interaction
 * @param {*} id Id of the item
 * @param {*} name Name of the item
 */
async function buyShopItem(interaction, id, name) {
    if (!interaction) return;
    const item = await interaction.client.models['economy-system']['Shop'].findAll({
        where: {
            [Op.or]: [
                {name: name},
                {id: id}
            ]
        }
    });
    if (item.length < 1) return interaction.reply({
        content: interaction.client.configurations['economy-system']['strings']['notFound'],
        ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']
    });
    else if (item.length > 1) return interaction.reply({
        content: interaction.client.configurations['economy-system']['strings']['multipleMatches'],
        ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']
    });

    if (interaction.member.roles.cache.has(item[0]['role'])) return interaction.reply({
        content: interaction.client.configurations['economy-system']['strings']['rebuyItem'],
        ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']
    });
    let user = await interaction.client.models['economy-system']['Balance'].findOne({
        where: {
            id: interaction.user.id
        }
    });
    if (!user) {
        createUser(interaction.client, interaction.user.id);
        user = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: interaction.user.id
            }
        });
    }
    if (user.balance < item[0]['price']) return interaction.reply({
        content: interaction.client.configurations['economy-system']['strings']['notEnoughMoney'],
        ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']
    });
    await editBalance(interaction.client, interaction.user.id, 'remove', item[0]['price']);
    await interaction.member.roles.add(item[0]['role']);
    leaderboard(interaction.client);
    interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['buyMsg'], {'%item%': item[0]['name']}, {ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']}));
    interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'user-purchase', {
        u: interaction.user.tag,
        i: item[0]['name'],
        p: item[0]['price']
    }));
    if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'user-purchase', {
        u: interaction.user.tag,
        i: item[0]['name'],
        p: item[0]['price']
    }));
    await shopMsg(interaction.client);
}

/**
 * Function to delete a shop-item
 * @param {string} pName Name of the item
 * @param {string} pId ID if the item
 * @param {Client} client Client
 * @returns {Promise}
 */
async function deleteShopItemAPI(pName, pId, client) {
    return new Promise(async (resolve) => {
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
            await shopMsg(client);
            resolve(`Deleted the item ${pName}/ ${pId} successfully`);
        }
    });
}


/**
 * Function to delete a shop-item
 * @param {*} interaction Interaction
 * @returns {Promise}
 */
async function deleteShopItem(interaction) {
    return new Promise(async (resolve) => {
        const name = interaction.options.get('item-name')['value'];
        const id = interaction.options.get('item-id')['value'];
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
            await shopMsg(interaction.client);
            resolve(`Deleted the item ${name} successfully`);
        }
    });
}

/**
 * Create the shop message
 * @param {Client} client Client
 * @param {object} guild Object of the guild
 * @param {boolean} ephemeral Should the message be ephemeral?
 * @returns {string}
 */
async function createShopMsg(client, guild, ephemeral) {
    const items = await client.models['economy-system']['Shop'].findAll();
    let string = '';
    const options = [];
    for (let i = 0; i < items.length; i++) {
        const roles = await guild.roles.fetch(items[i].dataValues.role);
        string = `${string}${inputReplacer({'%id%': items[i].dataValues.id, '%itemName%': items[i].dataValues.name, '%price%': `${items[i].dataValues.price} ${client.configurations['economy-system']['config']['currencySymbol']}`, '%sellcount%': roles ? roles.members.size : '0'}, client.configurations['economy-system']['strings']['itemString'])}`;
        options.push({
            label: items[i].dataValues.name,
            description: localize('economy-system', 'select-menu-price', {
                p: `${items[i].dataValues.price} ${client.configurations['economy-system']['config']['currencySymbol']}`
            }),
            value: items[i].dataValues.id
        });
    }
    let components = [];
    if (items.length > 0) {
        components = [{
            type: 'ACTION_ROW',
            components: [{
                type: 3,
                placeholder: localize('economy-system', 'nothing-selected'),
                'min_values': 1,
                'max_values': 1,
                options: options,
                'custom_id': 'economy-system_shop-select'
            }]
        }];
    }
    return embedType(client.configurations['economy-system']['strings']['shopMsg'], {'%shopItems%': string}, { ephemeral: ephemeral, components: components });
}

/**
 * Create a shop message in the configured channel
 * @param {Client} client Client
 */
async function shopMsg(client) {
    if (!client.configurations['economy-system']['config']['shopChannel'] || client.configurations['economy-system']['config']['shopChannel'] === '') return;
    const channel = await client.channels.fetch(client.configurations['economy-system']['config']['shopChannel']);
    if (!channel) return client.logger.error(`[economy-system] ` + localize('economy-system', 'channel-not-found', {c: moduleConfig['leaderboardChannel']}));
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
    if (messages.last()) await messages.last().edit(await createShopMsg(client, channel.guild, false));
    else channel.send(await createShopMsg(client, channel.guild, false));
}

/**
 * Gets the ten users with the most money
 * @param {object} object Object of the users
 * @param {Client} client Client
 * @returns {string}
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

    if (model.length !== 0) embed.addFields({name: 'Leaderboard:', value: await topTen(model, client)});
    if ((moduleStr['leaderboardEmbed']['thumbnail'] || '').replaceAll(' ', '')) embed.setThumbnail(moduleStr['leaderboardEmbed']['thumbnail']);
    if ((moduleStr['leaderboardEmbed']['image'] || '').replaceAll(' ', '')) embed.setImage(moduleStr['leaderboardEmbed']['image']);

    if (messages.last()) await messages.last().edit({embeds: [embed]});
    else channel.send({embeds: [embed]});
}


module.exports.editBalance = editBalance;
module.exports.editBank = editBank;
module.exports.createUser = createUser;
module.exports.buyShopItem = buyShopItem;
module.exports.createShopItemAPI = createShopItemAPI;
module.exports.createShopItem = createShopItem;
module.exports.deleteShopItemAPI = deleteShopItemAPI;
module.exports.deleteShopItem = deleteShopItem;
module.exports.createShopMsg = createShopMsg;
module.exports.shopMsg = shopMsg;
module.exports.createleaderboard = leaderboard;