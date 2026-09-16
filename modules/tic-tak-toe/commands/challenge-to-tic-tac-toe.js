const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const ticTacToeCommand = require('./tic-tac-toe');

module.exports.config = {
    name: 'Challenge to Tic Tac Toe',
    type: 'USER',
    contextMenu: true,
    description: localize('tic-tac-toe', 'challenge-to-tic-tac-toe-context-description')
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
    return ticTacToeCommand.run(proxy);
};
