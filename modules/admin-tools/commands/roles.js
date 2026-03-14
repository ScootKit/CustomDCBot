const {localize} = require('../../../src/functions/localize');
const durationParser = require('parse-duration');
const {createTemporaryRoleAction, createTemporaryRoleChangeAction} = require('../temporaryRoles');
const {client} = require('../../../main');
const {formatDate} = require('../../../src/functions/helpers');

module.exports.beforeSubcommand = async function (interaction) {
    const member = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id).catch(() => {
    });
    if (!member) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('admin-tools', 'user-not-found')
    });
    const role = interaction.options.getRole('role');
    if (role) {
        if (role.position >= interaction.guild.me.roles.highest.position) return interaction.reply({
            ephemeral: true,
            allowedMentions: {parse: []},
            content: '⚠️ ' + localize('admin-tools', 'role-not-high-enough', {e: role.toString()})
        });
        if (interaction.guild.ownerId !== interaction.user.id && role.position >= interaction.member.roles.highest.position) return interaction.reply({
            ephemeral: true,
            allowedMentions: {parse: []},
            content: '⚠️ ' + localize('admin-tools', 'users-trying-to-manage-higher-role', {
                t: interaction.member.roles.highest.toString(),
                e: role.toString()
            })
        });
        if (interaction.options.getString('duration')) {
            interaction.duration = durationParser(interaction.options.getString('duration'));
            if (interaction.duration === 0 || !interaction.duration || interaction.duration < 20000) return interaction.reply({
                content: '⚠️ ' + localize('admin-tools', 'duration-wrong'),
                ephemeral: true
            });
            interaction.removeDate = new Date(new Date().getTime() + interaction.duration);
        }
    }
    await interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    give: async function (interaction) {
        if (interaction.replied) return;
        const member = interaction.options.getMember('user');
        member.roles.add(interaction.options.getRole('role'), localize('admin-tools', `audit-log-add${interaction.removeDate ? '-duration' : ''}`, {
            u: interaction.user.username,
            t: interaction.removeDate?.toLocaleString(interaction.client.locale.split('_')[0])
        })).then(() => {
            if (interaction.removeDate) createTemporaryRoleChangeAction(client, 'remove', interaction.removeDate, interaction.options.getRole('role').id, interaction.options.getUser('user').id);
            interaction.editReply({
                allowedMentions: {parse: []},
                content: '✅ ' + localize('admin-tools', `role-add${interaction.removeDate ? '-duration' : ''}`, {
                    u: member.toString(),
                    t: interaction.removeDate ? formatDate(interaction.removeDate) : '',
                    r: interaction.options.getRole('role').toString()
                })
            });
        }).catch(e => {
            interaction.editReply({
                allowedMentions: {parse: []},
                content: '⚠️ ' + localize('admin-tools', 'unable-to-change-roles', {
                    r: interaction.options.getRole('role').toString(),
                    u: member.toString(),
                    e: e.toString()
                })
            });
        });
    },
    remove: async function (interaction) {
        if (interaction.replied) return;
        const member = interaction.options.getMember('user');
        member.roles.remove(interaction.options.getRole('role'), localize('admin-tools', `audit-log-remove${interaction.removeDate ? '-duration' : ''}`, {
            u: interaction.user.username,
            t: interaction.removeDate?.toLocaleString(interaction.client.locale.split('_')[0])
        })).then(() => {
            if (interaction.removeDate) createTemporaryRoleChangeAction(client, 'add', interaction.removeDate, interaction.options.getRole('role').id, interaction.options.getUser('user').id);
            interaction.editReply({
                allowedMentions: {parse: []},
                content: '✅ ' + localize('admin-tools', `role-remove${interaction.removeDate ? '-duration' : ''}`, {
                    u: member.toString(),
                    t: interaction.removeDate ? formatDate(interaction.removeDate) : '',
                    r: interaction.options.getRole('role').toString()
                })
            });
        }).catch(e => {
            interaction.editReply({
                allowedMentions: {parse: []},
                content: '⚠️ ' + localize('admin-tools', 'unable-to-change-roles', {
                    r: interaction.options.getRole('role').toString(),
                    u: member.toString(),
                    e: e.toString()
                })
            });
        });
    },
    status: async function (interaction) {
        if (interaction.replied) return;
        const roles = await client.models['admin-tools']['TemporaryRoleChange'].findAll({
            where: {
                userID: interaction.options.getMember('user').id
            }
        });
        if (roles.length === 0) return interaction.editReply({
            allowedMentions: {parse: []},
            content: '⚠️ ' + localize('admin-tools', 'user-without-temporary-action', {u: interaction.options.getMember('user').toString()})
        });
        let answerString = '';
        for (const role of roles) {
            answerString = answerString + '\n* ' + localize('admin-tools', `status-${role.type}`, {
                r: `<@&${role.roleID}>`,
                t: formatDate(new Date(parseInt(role.changeDate)))
            });
        }
        interaction.editReply({
            allowedMentions: {parse: []},
            content: `## ${localize('admin-tools', 'user-temporary-action-header', {u: interaction.options.getMember('user').toString()})}\n\n${answerString}`
        });
    }
};

module.exports.config = {
    name: 'roles',
    description: localize('admin-tools', 'command-description'),
    defaultMemberPermissions: ['ADMINISTRATOR'],
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'give',
            description: localize('admin-tools', 'role-give-description'),
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: localize('admin-tools', 'role-user-add-description')
                },
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: localize('admin-tools', 'role-add-role-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: false,
                    description: localize('admin-tools', 'role-add-duration-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove',
            description: localize('admin-tools', 'role-remove-description'),
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: localize('admin-tools', 'role-user-remove-description')
                },
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: localize('admin-tools', 'role-remove-role-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: false,
                    description: localize('admin-tools', 'role-remove-duration-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'status',
            description: localize('admin-tools', 'role-status-description'),
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: localize('admin-tools', 'role-user-status-description')
                }
            ]
        }
    ]
};