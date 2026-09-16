const {localize} = require('../../../src/functions/localize');
const {MessageFlags} = require('discord.js');
const {isInHoldingState} = require('../baseRoles');

module.exports.config = {
    name: 'Restore Base Roles',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_ROLES'],
    description: localize('welcomer', 'restore-base-roles-context-description')
};

module.exports.run = async function (interaction) {
    await interaction.deferReply({flags: MessageFlags.Ephemeral});
    const client = interaction.client;
    const welcomerConfig = client.configurations['welcomer']['config'];

    if (!welcomerConfig['treat-welcome-roles-as-base-roles']) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'base-roles-disabled')});

    const joinRoleIDs = welcomerConfig['give-roles-on-join'] || [];
    if (joinRoleIDs.length === 0) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'no-join-roles-configured')});

    const target = interaction.targetMember || await interaction.guild.members.fetch(interaction.targetUser.id).catch(() => null);
    if (!target) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'status-no-member')});

    if (await isInHoldingState(target, client)) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'assign-skipped-holding')});

    const missing = joinRoleIDs.filter(id => !target.roles.cache.has(id));
    if (missing.length === 0) return interaction.editReply({content: localize('welcomer', 'assign-already-has', {u: target.user.toString()})});

    try {
        await target.roles.add(missing, localize('welcomer', 'base-role-audit-reason'));
    } catch (e) {
        return interaction.editReply({
            content: '⚠️ ' + localize('welcomer', 'assign-role-failed', {
                u: target.id,
                r: missing.join(', '),
                e: (e && e.message) ? e.message : String(e)
            })
        });
    }

    client.logger.info(localize('welcomer', 'base-role-re-added', {
        u: target.id,
        r: missing.join(', '),
        a: 'context-restore'
    }));
    return interaction.editReply({
        content: localize('welcomer', 'assign-success', {
            u: target.user.toString(),
            r: missing.map(id => `<@&${id}>`).join(', ')
        })
    });
};