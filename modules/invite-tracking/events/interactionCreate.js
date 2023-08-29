const {localize} = require('../../../src/functions/localize');
const {formatDiscordUserName} = require('../../../src/functions/helpers');
exports.run = async (client, interaction) => {
    if (!interaction.client.botReadyAt) return;
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('uinv-rev')) {
        await interaction.deferReply({ephemeral: true});
        const guildInvites = await interaction.guild.invites.fetch();
        try {
            for (const invite of guildInvites.filter(i => i.inviter.id === interaction.customId.replaceAll('uinv-rev-', '')).values()) {
                await invite.delete(localize('invite-tracking', 'invite-revoke-audit-log', {u: formatDiscordUserName(interaction.user)}));
            }
            await interaction.editReply({
                content: localize('invite-tracking', 'revoked-invites-successfully')
            });
        } catch (e) {
            client.logger.warn(localize('invite-tracking', 'invite-revoked-error', {e}));
            await interaction.editReply({
                content: '⚠️ ' + localize('invite-tracking', 'invite-revoked-error', {
                    e,
                    c
                })
            });
        }
        return;
    }
    if (!interaction.customId.startsWith('inv-rev-')) return;
    if (!interaction.member.permissions.has('MANAGE_GUILD')) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('invite-tracking', 'missing-revoke-permissions')
    });
    const code = interaction.customId.replaceAll('inv-rev-', '');
    const invite = await client.guild.invites.fetch(code).catch(() => {});
    if (!invite) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('invite-tracking', 'invite-not-found')
    });
    await interaction.message.edit({embeds: [interaction.message.embeds[0]], components: []});
    invite.delete(localize('invite-tracking', 'invite-revoke-audit-log', {u: formatDiscordUserName(interaction.user)})).then(() => {
        interaction.reply({ephemeral: true, content: localize('invite-tracking', 'invite-revoked')});
    }).catch((e) => {
        client.logger.warn(localize('invite-tracking', 'invite-revoked-error', {e, c: code}));
        interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('invite-tracking', 'invite-revoked-error', {e, c: code})
        });
    });
};