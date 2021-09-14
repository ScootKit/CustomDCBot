const {arrayToApplicationCommandPermissions, embedType} = require('../../../src/functions/helpers');
const {generatePartnerList} = require('../partnerlist');

module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    'add': async function (interaction) {
        const moduleConf = interaction.client.configurations['partner-list']['config'];
        if (moduleConf['category-roles'][interaction.options.getString('category')]) {
            const owner = await interaction.guild.members.fetch(interaction.options.getUser('owner'));
            await owner.roles.add(moduleConf['category-roles'][interaction.options.getString('category')]).catch(() => {
                interaction.client.logger.error('[partner-list] Could not give role to user');
            });
        }
        if (moduleConf.sendNotificationToPartner) {
            interaction.options.getUser('owner').send(embedType(moduleConf['newPartnerDM'], {
                '%name%': interaction.options.getString('name'),
                '%category%': interaction.options.getString('category')
            })).catch(() => {
            });
        }
        await interaction.client.models['partner-list']['Partner'].create({
            invLink: interaction.options.getString('invite-url'),
            teamUserID: interaction.user.id,
            userID: interaction.options.getUser('owner').id,
            name: interaction.options.getString('name'),
            category: interaction.options.getString('category')
        });
        await generatePartnerList(interaction.client);
    },
    'delete': async function (interaction) {
        const partner = await interaction.client.models['partner-list']['Partner'].findOne({
            where: interaction.options.getInteger('id')
        });
        if (!partner) {
            interaction.returnEarly = true;
            return interaction.editReply({
                content: 'Partner could not be found. Please check if you are using the right partner-ID. The partner-ID is not identical with the server-id of the partner. The Partner-ID can be found [here](https://gblobscdn.gitbook.com/assets%2F-MNyHzQ4T8hs4m6x1952%2F-MWDvDO9-_JwAGqtD6at%2F-MWDxIcOHB9VcWhjsWt7%2Fscreen_20210320-102628.png?alt=media&token=2f9ac1f7-1a14-445c-b34e-83057789578e) in the partner-embed.'
            });
        }

        const moduleConf = interaction.client.configurations['partner-list']['config'];
        const member = await interaction.guild.members.fetch(partner.userID).catch(() => {
        });

        if (member && moduleConf['category-roles'][partner.category]) await member.roles.remove(moduleConf['category-roles'][partner.category]).catch(() => {
            interaction.client.logger.error('[partner-list] Could not remove role from user');
        });
        if (member && moduleConf.sendNotificationToPartner) await member.user.send(embedType(moduleConf.byePartnerDM, {
            '%name%': partner.name,
            '%category%': partner.category
        }));

        await partner.destroy();
        await generatePartnerList(interaction.client);
    },
    'edit': async function (interaction) {
        const partner = await interaction.client.models['partner-list']['Partner'].findOne({
            where: interaction.options.getInteger('id')
        });
        if (!partner) {
            interaction.returnEarly = true;
            return interaction.editReply({
                content: 'Partner could not be found. Please check if you are using the right partner-ID. The partner-ID is not identical with the server-id of the partner. The Partner-ID can be found [here](https://gblobscdn.gitbook.com/assets%2F-MNyHzQ4T8hs4m6x1952%2F-MWDvDO9-_JwAGqtD6at%2F-MWDxIcOHB9VcWhjsWt7%2Fscreen_20210320-102628.png?alt=media&token=2f9ac1f7-1a14-445c-b34e-83057789578e) in the partner-embed.'
            });
        }
        const moduleConf = interaction.client.configurations['partner-list']['config'];
        if (interaction.options.getString('name')) partner.name = interaction.options.getString('name');
        if (interaction.options.getString('invite-url')) partner.invLink = interaction.options.getString('invite-url');
        if (interaction.options.getString('category')) {
            const member = await interaction.guild.members.fetch(partner.userID).catch(() => {
            });
            if (member && moduleConf['category-roles'][partner.category]) await member.roles.remove(moduleConf['category-roles'][partner.category]).catch(() => {
                interaction.client.logger.error('[partner-list] Could not remove role from user');
            });
            partner.category = interaction.options.getString('category');
            if (member && moduleConf['category-roles'][partner.category]) await member.roles.add(moduleConf['category-roles'][partner.category]).catch(() => {
                interaction.client.logger.error('[partner-list] Could not remove role from user');
            });
        }

        await partner.save();
        await generatePartnerList(interaction.client);
    }
};

module.exports.run = async function (interaction) {
    if (!interaction.returnEarly) await interaction.editReply({content: ':+1: Edited partner-list successfully.'});
};

module.exports.config = {
    name: 'partner',
    description: 'Manages the partner-list on this server',
    defaultPermission: false,
    permissions: function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['partner-list']['config']['adminRoles'], 'ROLE');
    },
    options: function (client) {
        const cats = [];
        for (const category of client.configurations['partner-list']['config']['categories']) {
            cats.push({name: category, value: category});
        }
        return [
            {
                type: 'SUB_COMMAND',
                name: 'add',
                description: 'Add a new partner',
                options: [
                    {
                        type: 'STRING',
                        name: 'name',
                        required: true,
                        description: 'Name of the partner'
                    },
                    {
                        type: 'STRING',
                        name: 'category',
                        required: true,
                        description: 'Please select one of the categories specified in your configuration',
                        choices: cats
                    },
                    {
                        type: 'USER',
                        name: 'owner',
                        required: true,
                        description: 'Owner of the partnered server'
                    },
                    {
                        type: 'STRING',
                        name: 'invite-url',
                        required: true,
                        description: 'Invite to the partnered server'
                    }
                ]
            },
            {
                type: 'SUB_COMMAND',
                name: 'edit',
                description: 'Edit an existing partner',
                options: [
                    {
                        type: 'INTEGER',
                        required: true,
                        name: 'id',
                        description: 'ID of the partner'
                    },
                    {
                        type: 'STRING',
                        name: 'name',
                        description: 'New name of the partner'
                    },
                    {
                        type: 'STRING',
                        name: 'invite-url',
                        description: 'New invite to this partner'
                    },
                    {
                        type: 'STRING',
                        name: 'category',
                        choices: cats,
                        description: 'New category of this partner'
                    }
                ]
            },
            {
                type: 'SUB_COMMAND',
                name: 'delete',
                description: 'Deletes an exising partner',
                options: [
                    {
                        type: 'INTEGER',
                        name: 'id',
                        description: 'ID of the partner',
                        required: true
                    }
                ]
            }
        ];
    }
};