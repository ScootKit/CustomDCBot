const {balance} = require('../economy-system');

module.exports.beforeSubcommand = async function (interaction) {
    interaction.str = interaction.client.configurations['economy-system']['strings'];
    interaction.config = interaction.client.configurations['economy-system']['config'];
};

module.exports.subcommands = {
    'work': async function (interaction) {
        const model = interaction.client.models['economy-system']['cooldown'];
        if (model.findOne({
            where: {
                id: interaction.user.id,
                command: 'work'
            }
        })) {
            return interaction.reply({
                content: interaction.strings['cooldown'],
                ephemeral: true
            });
        }
        model.create({
            id: interaction.user.id,
            command: 'work'
        });
        balance(interaction.client, interaction.user.id, 'add', Math.floor(Math.random() * (interaction.config['max'] - interaction.config['min'])) + interaction.config['min']);
    }
};

module.exports.config = {
    name: 'economy-system',
    description: 'general economy-system',
    defaultPermission: true,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'work',
            description: 'Work to earn money'
        }
    ]
};