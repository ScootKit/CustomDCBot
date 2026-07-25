const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const {run: runSlap} = require('./slap');

module.exports.config = {
    name: 'Slap',
    type: 'USER',
    contextMenu: true,
    description: localize('fun', 'slap-context-description')
};

module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const proxy = Object.create(interaction);
    proxy.options = {getUser: () => interaction.targetUser};
    return runSlap(proxy);
};
