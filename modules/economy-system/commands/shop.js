const {createShopItem, createShopMsg, deleteShopItem, shopMsg, buyShopItem} = require('../economy-system');
const {localize} = require('../../../src/functions/localize');

/**
 * @param {*} interaction Interaction
 * @returns {boolean} Result
 */
async function checkPerms(interaction) {
    const result = interaction.client.configurations['economy-system']['config']['shopManagers'].includes(interaction.user.id) || interaction.client.config['botOperators'].includes(interaction.user.id);
    if (!result) {
        await interaction.reply({
            content: interaction.client.strings['not_enough_permissions'],
            ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']
        });
    }
    return result;
}

module.exports.subcommands = {
    'add': async function (interaction) {
        if (!checkPerms(interaction)) return;
        await createShopItem(interaction);
        await shopMsg(interaction.client);
    },
    'buy': async function (interaction) {
        const name = await interaction.options.getString('item-name');
        const id = await interaction.options.getString('item-id');
        await buyShopItem(interaction, id, name);
    },
    'list': async function (interaction) {
        const msg = await createShopMsg(interaction.client, interaction.guild, !interaction.client.configurations['economy-system']['config']['publicCommandReplies']);
        interaction.reply(msg);
    },
    'delete': async function (interaction) {
        if (!checkPerms(interaction)) return;
        await deleteShopItem(item['value'], interaction.client);
        await shopMsg(interaction.client);
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
                    name: 'item-name',
                    description: localize('economy-system', 'shop-option-description-itemName')
                },
                {
                    type: 'STRING',
                    required: true,
                    name: 'item-id',
                    description: localize('economy-system', 'shop-option-description-itemID')
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
                    name: 'item-name',
                    description: localize('economy-system', 'shop-option-description-itemName'),
                    required: false
                },
                {
                    type: 'STRING',
                    name: 'item-id',
                    description: localize('economy-system', 'shop-option-description-itemID'),
                    required: false
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
                    name: 'item-name',
                    description: localize('economy-system', 'shop-option-description-itemName'),
                    required: false
                },
                {
                    type: 'STRING',
                    name: 'item-id',
                    description: localize('economy-system', 'shop-option-description-itemID'),
                    required: false
                }
            ]
        }
    ]
};