const {localize} = require('../../../src/functions/localize');
const {sendUserInfo} = require('./info');

module.exports.config = {
    name: 'User Info',
    type: 'USER',
    contextMenu: true,
    description: localize('info-commands', 'user-info-context-description')
};

module.exports.run = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    let member = interaction.targetMember;
    if (!member) member = await interaction.guild.members.fetch(interaction.targetUser.id);
    return sendUserInfo(interaction, member);
};
