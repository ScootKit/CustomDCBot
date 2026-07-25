const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const {run: runHug} = require('./hug');

module.exports.config = {
    name: 'Hug',
    type: 'USER',
    contextMenu: true,
    description: localize('fun', 'hug-context-description')
};

module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const proxy = Object.create(interaction);
    proxy.options = {getUser: () => interaction.targetUser};
    return runHug(proxy);
};
