const {balance, createleaderboard} = require('../economy-system');
const {embedType} = require('../../../src/functions/helpers');

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
        const cooldown = model.create({
            id: interaction.user.id,
            command: 'work'
        });
        const moneyToAdd = Math.floor(Math.random() * (interaction.config['maxWorkMoney'] - interaction.config['minWorkMoney'])) + interaction.config['minWorkMoney'];
        balance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply({
            content: embedType(interaction.str['workSuccess'], {
                '%erned%': `${moneyToAdd} ${interaction.config['currencySymbol']}`
            })
        });
        const cooldownTime = interaction.config['workCooldown'] * 1000;
        setInterval(() => {
            cooldown.destroy();
        }, cooldownTime);
        createleaderboard(interaction.client);
    },
    'crime': async function (interaction) {
        const model = interaction.client.models['economy-system']['cooldown'];
        if (model.findOne({
            where: {
                id: interaction.user.id,
                command: 'crime'
            }
        })) {
            return interaction.reply({
                content: interaction.strings['cooldown'],
                ephemeral: true
            });
        }
        const cooldown = model.create({
            id: interaction.user.id,
            command: 'crime'
        });
        const moneyToAdd = Math.floor(Math.random() * (interaction.config['maxCrimeMoney'] - interaction.config['minCrimeMoney'])) + interaction.config['minCrimeMoney'];
        balance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply({
            content: embedType(interaction.str['crimeSuccess'], {
                '%erned%': `${moneyToAdd} ${interaction.config['currencySymbol']}`
            }),
            ephemeral: true
        });
        const cooldownTime = interaction.config['crimeCooldown'] * 1000;
        setInterval(() => {
            cooldown.destroy();
        }, cooldownTime);
        createleaderboard(interaction.client);
    },
    'rob': async function (interaction) {
        const user = interaction.options.getUser('user');
        if (model.findOne({
            where: {
                id: interaction.user.id,
                command: 'rob'
            }
        })) {
            return interaction.reply({
                content: interaction.strings['cooldown'],
                ephemeral: true
            });
        }
        const cooldown = model.create({
            id: interaction.user.id,
            command: 'rob'
        });
        const robbedUser = interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        let toRob = robbedUser.balance * (interaction.config['robPercent'] / 100);
        if (toRob >= interaction.config['maxRobAmount']) toRob = interaction.config['maxRobAmount'];
        balance(interaction.client, interaction.user.id, 'add', toRob);
        balance(interaction.client, user.id, 'remove', toRob);
        interaction.reply({
            content: embedType(interaction.str['robSuccess'], {
                '%erned%': `${toRob} ${interaction.config['currencySymbol']}`,
                'user': `<@${user}>`
            }),
            ephemeral: true
        });
        const cooldownTime = interaction.config['robCooldown'] * 1000;
        setInterval(() => {
            cooldown.destroy();
        }, cooldownTime);
        createleaderboard(interaction.client);
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
        },
        {
            type: 'SUB_COMMAND',
            name: 'crime',
            description: 'Do something criminal to earn money'
        },
        {
            type: 'SUB_COMMAND',
            name: 'rob',
            description: 'Rob money from a user',
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: 'User to rob the money from'
                }
            ]
        }
    ]
};