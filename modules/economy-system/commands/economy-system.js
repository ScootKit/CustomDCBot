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
    },
    'add': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        if (!interaction.client.configurations['economy-system']['config']['allowCheats']) return interaction.reply({
            content: 'This command isn`t enabled',
            ephemeral: true
        });
        if (interaction.optins.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(`The admin ${interaction.user.name} wanted to abuse the permissions. This can't be ignored!`);
            return interaction.reply({
                content: `What a bad admin you are, ${interaction.user.name}. I'm disappointed with you! I need to report this. If I could i would ban you!`,
                ephemeral: true
            });
        }
        balance(interaction.client, interaction.optins.getUser('user').id, 'add', parseInt(interaction.optins.get('amount')));
    },
    'remove': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        if (!interaction.client.configurations['economy-system']['config']['allowCheats']) return interaction.reply({
            content: 'This command isn`t enabled',
            ephemeral: true
        });
        if (interaction.optins.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(`The admin ${interaction.user.name} wanted to abuse the permissions. This can't be ignored!`);
            return interaction.reply({
                content: `What a bad admin you are, ${interaction.user.name}. I'm disappointed with you! I need to report this. If I could i would ban you!`,
                ephemeral: true
            });
        }
        balance(interaction.client, interaction.optins.getUser('user').id, 'remove', parseInt(interaction.optins.get('amount')));
    },
    'set': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id)) {
            return await interaction.reply({
                content: interaction.client.strings['not_enough_permissions'],
                ephemeral: true
            });
        }
        if (!interaction.client.configurations['economy-system']['config']['allowCheats']) return interaction.reply({
            content: 'This command isn`t enabled',
            ephemeral: true
        });
        if (interaction.optins.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(`The admin ${interaction.user.name} wanted to abuse the permissions. This can't be ignored!`);
            return interaction.reply({
                content: `What a bad admin you are, ${interaction.user.name}. I'm disappointed with you! I need to report this. If I could i would ban you!`,
                ephemeral: true
            });
        }
        balance(interaction.client, interaction.optins.getUser('user').id, 'set', parseInt(interaction.optins.get('balance')));
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
        },
        {
            type: 'SUB_COMMAND',
            name: 'add',
            description: 'Add xyz to the balance of a User',
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: 'User to rob the money from'
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'amount',
                    description: 'The amount of money to add'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove',
            description: 'Remove xyz from the balance of a User',
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: 'User to rob the money from'
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'amount',
                    description: 'The amount of money to remove'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'set',
            description: 'Set the balance of a User to xyz',
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: 'User to rob the money from'
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'balance',
                    description: 'The new balance of the User'
                }
            ]
        }
    ]
};