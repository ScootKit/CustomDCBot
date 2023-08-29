const {verificationPassed, verificationFail, sendDMPart} = require('./guildMemberAdd');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async (client, interaction) => {
    if (!interaction.isMessageComponent()) return;
    if (interaction.customId === 'mod-rvp') {
        const verificationConfig = client.configurations['moderation']['verification'];
        if (interaction.member.roles.cache.filter(r => verificationConfig['verification-passed-role'].includes(r.id)).size !== 0) return interaction.reply({
            ephemeral: true,
            content: '⚠️️ ' + localize('moderation', 'already-verified')
        });
        sendDMPart(verificationConfig, interaction.member).then(() => {
            interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'restarted-verification')
            });
        }).catch(() => {
            interaction.reply({
                ephemeral: true,
                content: '⚠️️ ' + localize('moderation', 'dms-still-disabled', {g: interaction.member.guild.name})
            });
        });
    }
    if (!interaction.customId.startsWith('mod-ver-')) return;
    interaction.customId = interaction.customId.replaceAll('mod-ver-', '');
    const a = interaction.customId.split('-')[0];
    const id = interaction.customId.split('-')[1];
    const member = await interaction.guild.members.fetch(id).catch(() => {});
    if (!member) return interaction.reply({
        ephemeral: true,
        content: '⚠️️ ' + localize('moderation', 'member-not-found')
    });
    if (a === 'p') await verificationPassed(member);
    else await verificationFail(member);
    await interaction.message.edit({embeds: interaction.message.embeds, components: []});
    interaction.reply({ephemeral: true, content: localize('moderation', 'verification-update-proceeded')});
};