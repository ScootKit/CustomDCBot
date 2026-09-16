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
                getMember: (name) => (name === 'user' ? interaction.targetMember : interaction.options.getMember(name))
            }
        }
    });
    return duelCommand.run(proxy);
};
