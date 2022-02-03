const {createShopItem, balance, createShopMsg, deleteShopItem, createleaderboard} = require('../economy-system');
const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

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
        await createShopItem(item['value'], price, role.id, interaction.client);
        interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['itemCreate'], {
            '%item%': item['value'],
            '%price%': price,
            '%role%': role.name
        }, {ephemeral: true}));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'created-item', {
            u: interaction.user.tag,
            i: item['value']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'created-item', {
            u: interaction.user.tag,
            i: item['value']
        }));
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
        interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['buyMsg'], {'%item%': itemName['value']}, {ephemeral: true}));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'user-purchase', {
            u: interaction.user.tag,
            i: item['value'],
            p: item['price']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'user-purchase', {
            u: interaction.user.tag,
            i: item['value'],
            p: item['price']
        }));
    },
    'list': async function (interaction) {
        const msg = await createShopMsg(interaction.client);
        interaction.reply(msg);
    },
    'delete': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['shopManagers'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        const item = interaction.options.get('item');
        await deleteShopItem(item['value'], interaction.client);
        interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['itemDelete'], {'%item%': item['value']}, {ephemeral: true}));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'delete-item', {
            u: interaction.user.tag,
            i: item['value']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'delete-item', {
            u: interaction.user.tag,
            i: item['value']
        }));
    }
};

module.exports.config = {
    name: 'shop',
    description: localize('economy-system', 'shop-command-description'),
    defaultPermission: true,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'add',
            description: localize('economy-system', 'shop-command-description-add'),
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'item',
                    description: localize('economy-system', 'shop-option-description-item')
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'price',
                    description: localize('economy-system', 'shop-option-description-price')
                },
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: localize('economy-system', 'shop-option-description-role')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'buy',
            description: localize('economy-system', 'shop-command-description-buy'),
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'item',
                    description: localize('economy-system', 'shop-option-description-item')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'list',
            description: localize('economy-system', 'shop-command-description-list')
        },
        {
            type: 'SUB_COMMAND',
            name: 'delete',
            description: localize('economy-system', 'shop-command-description-delete'),
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'item',
                    description: localize('economy-system', 'shop-option-description-item')
                }
            ]
        }
    ]
};