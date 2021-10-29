const {createShopItem, balance, createShopEmbed, deleteShopItem} = require('../economy-system');

module.exports.subcommands = {
    'add': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['shopManagers'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        const item = interaction.options.get('item');
        const price = interaction.options.getInteger('price');
        const role = interaction.options.getRole('role', true);
        createShopItem(item, price, role, interaction.client).then(
            async function (message) {
                await interaction.reply({
                    content: message,
                    ephemeral: true
                });
            },
            async function (error) {
                await interaction.reply({
                    content: error,
                    ephemeral: true
                });
            }
        );
    },
    'buy': async function (interaction) {
        const itemName = interaction.options.get('item');
        const item = interaction.client.models['economy-system']['Shop'].findOne({
            where: {
                name: itemName
            }
        });
        if (!item) {
            interaction.reply({
                content: interaction.client.configurations['economy-system']['strings']['notFound'],
                ephemeral: true
            });
        }
        const user = interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: id
            }
        });
        if (user.balance < item.price) return interaction.reply({
            content: interaction.client.configurations['economy-system']['strings']['notEnoughMoney'],
            ephemeral: true
        });
        balance(interaction.client, interaction.user.id, 'remove', item.price, user.balance);
        interaction.user.roles.add(role);
    },
    'list': async function (interaction) {
        interaction.reply({
            content: await createShopEmbed(interaction.client),
            ephemeral: true
        });
    },
    'delete': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['shopManagers'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        deleteShopItem(interaction.options.get('item'), interaction.client).then(
            function (message) {
                interaction.reply({
                    content: message,
                    ephemeral: true
                });
            },
            function (error) {
                interaction.reply({
                    content: error,
                    ephemeral: true
                });
            });
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