const {embedType, truncate} = require('../../../src/functions/helpers');
const {generatePartnerList} = require('../partnerlist');
const {localize} = require('../../../src/functions/localize');

module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    'add': async function (interaction) {
        const moduleConf = interaction.client.configurations['partner-list']['config'];
        if (moduleConf['category-roles'][interaction.options.getString('category')]) {
            const owner = await interaction.guild.members.fetch(interaction.options.getUser('owner'));
            await owner.roles.add(moduleConf['category-roles'][interaction.options.getString('category')]).catch(() => {
                interaction.client.logger.error('[partner-list] ' + localize('partner-list', 'could-not-give-role', {u: owner.user.id}));
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
            where: {
                id: interaction.options.getString('id')
            }
        });
        if (!partner) {
            interaction.returnEarly = true;
            return interaction.editReply({
                content: localize('partner-list', 'partner-not-found')
            });
        }

        const moduleConf = interaction.client.configurations['partner-list']['config'];
        const member = await interaction.guild.members.fetch(partner.userID).catch(() => {
        });

        if (member && moduleConf['category-roles'][partner.category]) await member.roles.remove(moduleConf['category-roles'][partner.category]).catch(() => {
            interaction.client.logger.error('[partner-list] ' + localize('partner-list', 'could-not-remove-role', {u: member.user.id}));
        });
        if (member && moduleConf.sendNotificationToPartner) await member.user.send(embedType(moduleConf.byePartnerDM, {
            '%name%': partner.name,
            '%category%': partner.category
        })).catch(() => {});

        await partner.destroy();
        await generatePartnerList(interaction.client);
    },
    'edit': async function (interaction) {
        const partner = await interaction.client.models['partner-list']['Partner'].findOne({
            where: {
                id: interaction.options.getString('id')
            }
        });
        if (!partner) {
            interaction.returnEarly = true;
            return interaction.editReply({
                content: localize('partner-list', 'partner-not-found')
            });
        }
        const moduleConf = interaction.client.configurations['partner-list']['config'];
        if (interaction.options.getString('name')) partner.name = interaction.options.getString('name');
        if (interaction.options.getString('invite-url')) partner.invLink = interaction.options.getString('invite-url');
        if (interaction.options.getUser('staff')) partner.teamUserID = interaction.options.getUser('staff').id;
        if (interaction.options.getUser('owner')) partner.userID = interaction.options.getUser('owner').id;
        if (interaction.options.getString('category')) {
            const member = await interaction.guild.members.fetch(partner.userID).catch(() => {
            });
            if (member && moduleConf['category-roles'][partner.category]) await member.roles.remove(moduleConf['category-roles'][partner.category]).catch(() => {
                interaction.client.logger.error('[partner-list] ' + localize('partner-list', 'could-not-remove-role', {u: member.user.id}));
            });
            partner.category = interaction.options.getString('category');
            if (member && moduleConf['category-roles'][partner.category]) await member.roles.add(moduleConf['category-roles'][partner.category]).catch(() => {
                interaction.client.logger.error('[partner-list] ' + localize('partner-list', 'could-not-give-role', {u: member.user.id}));
            });
        }

        await partner.save();
        await generatePartnerList(interaction.client);
    }
};

module.exports.autoComplete = {
    'edit': {
        'id': autoCompletePartnerID
    },
    'delete': {
        'id': autoCompletePartnerID
    }
};

/**
 * @private
 * Run autocomplete on options with partner id
 * @param {Interaction} interaction
 * @return {Promise<void>}
 */
async function autoCompletePartnerID(interaction) {
    const partnerList = await interaction.client.models['partner-list']['Partner'].findAll({
        order: [['createdAt', 'DESC']]
    });
    const matches = [];
    interaction.value = interaction.value.toLowerCase();
    for (const match of partnerList.filter(p => p.id.toString().includes(interaction.value) || p.name.toLowerCase().includes(interaction.value) || p.category.toLowerCase().includes(interaction.value))) {
        if (matches.length !== 25) matches.push({
            value: match.id.toString(),
            name: truncate(`${match.category}: ${match.name}`, 100)
        });
    }
    interaction.respond(matches);
}

module.exports.run = async function (interaction) {
    if (!interaction.returnEarly) await interaction.editReply({content: ':+1: ' + localize('partner-list', 'successful-edit')});
};

module.exports.config = {
    name: 'partner',
    description: localize('partner-list', 'command-description'),

    defaultMemberPermissions: ['MANAGE_MESSAGES'],
    options: function (client) {
        const cats = [];
        for (const category of client.configurations['partner-list']['config']['categories']) {
            cats.push({name: category, value: category});
        }
        return [
            {
                type: 'SUB_COMMAND',
                name: 'add',
                description: localize('partner-list', 'padd-description'),
                options: [
                    {
                        type: 'STRING',
                        name: 'name',
                        required: true,
                        description: localize('partner-list', 'padd-name-description')
                    },
                    {
                        type: 'STRING',
                        name: 'category',
                        required: true,
                        description: localize('partner-list', 'padd-category-description'),
                        choices: cats
                    },
                    {
                        type: 'USER',
                        name: 'owner',
                        required: true,
                        description: localize('partner-list', 'padd-owner-description')
                    },
                    {
                        type: 'STRING',
                        name: 'invite-url',
                        required: true,
                        description: localize('partner-list', 'padd-inviteurl-description')
                    }
                ]
            },
            {
                type: 'SUB_COMMAND',
                name: 'edit',
                description: localize('partner-list', 'pedit-description'),
                options: [
                    {
                        type: 'STRING',
                        required: true,
                        name: 'id',
                        autocomplete: true,
                        description: localize('partner-list', 'pedit-id-description')
                    },
                    {
                        type: 'STRING',
                        name: 'name',
                        description: localize('partner-list', 'pedit-name-description')
                    },
                    {
                        type: 'STRING',
                        name: 'invite-url',
                        description: localize('partner-list', 'pedit-inviteurl-description')
                    },
                    {
                        type: 'STRING',
                        name: 'category',
                        choices: cats,
                        description: localize('partner-list', 'pedit-category-description')
                    },
                    {
                        type: 'USER',
                        name: 'owner',
                        description: localize('partner-list', 'pedit-owner-description')
                    },
                    {


                        type: 'USER',
                        name: 'staff',
                        description: localize('partner-list', 'pedit-staff-description')
                    }
                ]
            },
            {
                type: 'SUB_COMMAND',
                name: 'delete',
                description: localize('partner-list', 'pdelete-description'),
                options: [
                    {
                        type: 'STRING',
                        name: 'id',
                        autocomplete: true,
                        description: localize('partner-list', 'pdelete-id-description'),
                        required: true
                    }
                ]
            }
        ];
    }
};