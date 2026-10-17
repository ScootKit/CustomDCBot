const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const duelCommand = require('./duel');

module.exports.config = {
    name: 'Duel',
    type: 'USER',
    contextMenu: true,
    description: localize('duel', 'duel-context-description')
};

module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const proxy = Object.create(interaction, {
        options: {
            value: {
                ...interaction.options,
                getUser: (name) => (name === 'user' ? interaction.targetUser : interaction.options.getUser(name))
            }
        }
    });
    return duelCommand.run(proxy);
};
