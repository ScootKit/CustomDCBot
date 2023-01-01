const {createShopItem, editBalance, createShopMsg, deleteShopItem, createleaderboard, createUser} = require('../economy-system');
const {embedType} = require('../../../src/functions/helpers');
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
    'add': async function (interaction) { // ToDo: Update Command
        if (!checkPerms(interaction)) return;
        await createShopItem(interaction);
    },
    'buy': async function (interaction) {
        const name = await interaction.options.get('itemName')['value'];
        const id = await interaction.options.get('itemId')['value'];
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

        if (interaction.member.roles.cache.has(item['role'])) return interaction.reply({
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
        if (user.balance < item.price) return interaction.reply({
            content: interaction.client.configurations['economy-system']['strings']['notEnoughMoney'],
            ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']
        });
        await editBalance(interaction.client, interaction.user.id, 'remove', item.price);
        await interaction.member.roles.add(item.role);
        createleaderboard(interaction.client);
        interaction.reply(embedType(interaction.client.configurations['economy-system']['strings']['buyMsg'], {'%item%': itemName['value']}, {ephemeral: !interaction.client.configurations['economy-system']['config']['publicCommandReplies']}));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'user-purchase', {
            u: interaction.user.tag,
            i: item['name'],
            p: item['price']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'user-purchase', {
            u: interaction.user.tag,
            i: item['name'],
            p: item['price']
        }));
    },
    'list': async function (interaction) {
        const msg = await createShopMsg(interaction.client);
        interaction.reply(msg);
    },
    'delete': async function (interaction) {
        if (!checkPerms(interaction)) return;
        await deleteShopItem(item['value'], interaction.client);
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
                    name: 'itemName',
                    description: localize('economy-system', 'shop-option-description-itemName')
                },
                {
                    type: 'STRING',
                    required: true,
                    name: 'itemId',
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
                    name: 'itemName',
                    description: localize('economy-system', 'shop-option-description-itemName'),
                    required: false
                },
                {
                    type: 'STRING',
                    name: 'itemId',
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
                    name: 'itemName',
                    description: localize('economy-system', 'shop-option-description-itemName'),
                    required: false
                },
                {
                    type: 'STRING',
                    name: 'itemId',
                    description: localize('economy-system', 'shop-option-description-itemID'),
                    required: false
                }
            ]
        }
    ]
};