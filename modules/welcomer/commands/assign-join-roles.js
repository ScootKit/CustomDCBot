const {localize} = require('../../../src/functions/localize');
const {MessageFlags} = require('discord.js');
const {evaluateMember} = require('../baseRoles');

module.exports.config = {
    name: 'Assign Join Roles',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_ROLES'],
    description: localize('welcomer', 'assign-join-roles-context-description')
};

module.exports.run = async function (interaction) {
    await interaction.deferReply({flags: MessageFlags.Ephemeral});
    const client = interaction.client;
    const target = interaction.targetMember || await interaction.guild.members.fetch(interaction.targetUser.id).catch(() => null);
    if (!target) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'status-no-member')});

    const joinRoleIDs = client.configurations['welcomer']['config']['give-roles-on-join'] || [];
    if (joinRoleIDs.length === 0) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'no-join-roles-configured')});

    const {
        skip,
        missingRoleIDs
    } = await evaluateMember(target, client);
    if (skip) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'assign-skipped-holding')});
    if (missingRoleIDs.length === 0) return interaction.editReply({content: localize('welcomer', 'assign-already-has', {u: target.user.toString()})});

    try {
        await target.roles.add(missingRoleIDs, '[welcomer] ' + localize('welcomer', 'audit-log-reason-join-roles'));
    } catch (e) {
        return interaction.editReply({
            content: '⚠️ ' + localize('welcomer', 'assign-role-failed', {
                u: target.id,
                r: missingRoleIDs.join(', '),
                e: (e && e.message) ? e.message : String(e)
            })
        });
    }

    return interaction.editReply({
        content: localize('welcomer', 'assign-success', {
            u: target.user.toString(),
            r: missingRoleIDs.map(id => `<@&${id}>`).join(', ')
        })
    });
};