const {createShopItem, balance, createShopMsg, deleteShopItem, createleaderboard} = require('../economy-system');

module.exports.subcommands = {
    'add': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['shopManagers'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        const item = await interaction.options.get('item');
        const price = await interaction.options.getInteger('price');
        const role = await interaction.options.getRole('role', true);
        const msg = await createShopItem(item['value'], price, role.id, interaction.client);
        interaction.reply({
            content: msg,
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} has created the shop item ${item['value']}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} has created the shop item ${item['value']}`);
    },
    'buy': async function (interaction) {
        const itemName = await interaction.options.get('item');
        const item = await interaction.client.models['economy-system']['Shop'].findOne({
            where: {
                name: itemName['value']
            }
        });
        if (!item) {
            interaction.reply({
                content: interaction.client.configurations['economy-system']['strings']['notFound'],
                ephemeral: true
            });
        }
        const user = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: interaction.user.id
            }
        });
        if (user.balance < item.price) return interaction.reply({
            content: interaction.client.configurations['economy-system']['strings']['notEnoughMoney'],
            ephemeral: true
        });
        balance(interaction.client, interaction.user.id, 'remove', item.price);
        await interaction.member.roles.add(item.role);
        createleaderboard(interaction.client);
        interaction.reply({
            content: `You got the item ${itemName['value']}`,
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} has buyed the shop item ${itemName['value']}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} has buyed the shop item ${itemName['value']}`);
    },
    'list': async function (interaction) {
        const msg = await createShopMsg(interaction.client);
        interaction.reply({
            content: msg,
            ephemeral: true
        });
    },
    'delete': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['shopManagers'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        const item = interaction.options.get('item');
        const msg = await deleteShopItem(item['value'], interaction.client);
        interaction.reply({
            content: msg,
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} has deleted the shop item ${item['value']}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} has deleted the shop item ${item['value']}`);
    }
};

module.exports.config = {
    name: 'shop',
    description: 'The general shop-system',
    defaultPermission: true,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'add',
            description: 'Add an item to the shop (admin only)',
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'item',
                    description: 'Name of the item'
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'price',
                    description: 'Price of the item'
                },
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: 'Role which is added to each user who buys this item'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'buy',
            description: 'Buy the specified item',
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'item',
                    description: 'Name of the item'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'list',
            description: 'Show a list of all Items'
        },
        {
            type: 'SUB_COMMAND',
            name: 'delete',
            description: 'Delete the specified item (admin only)',
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'item',
                    description: 'Name of the item'
                }
            ]
        }
    ]
};