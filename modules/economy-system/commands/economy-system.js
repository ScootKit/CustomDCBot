const {balance, createleaderboard} = require('../economy-system');

module.exports.beforeSubcommand = async function (interaction) {
    interaction.str = interaction.client.configurations['economy-system']['strings'];
    interaction.config = interaction.client.configurations['economy-system']['config'];
};

module.exports.subcommands = {
    'work': async function (interaction) {
        const model = interaction.client.models['economy-system']['cooldown'];
        const cooldownModel = await model.findOne({
            where: {
                userId: interaction.user.id,
                command: 'work'
            }
        });
        if (cooldownModel) {
            return interaction.reply({
                content: interaction.str['cooldown'],
                ephemeral: true
            });
        }
        const cooldown = await model.create({
            userId: interaction.user.id,
            command: 'work'
        });
        const moneyToAdd = Math.floor(Math.random() * (interaction.config['maxWorkMoney'] - interaction.config['minWorkMoney'])) + interaction.config['minWorkMoney'];
        balance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply({
            content: interaction.str['workSuccess'].split('%erned%').join(`${moneyToAdd} ${interaction.config['currencySymbol']}`),
            ephemeral: true
        });
        const cooldownTime = interaction.config['workCooldown'] * 60000; // change to 60000
        setTimeout(async () => {
            await cooldown.destroy();
        }, cooldownTime);
        createleaderboard(interaction.client);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.id} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by working`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.id} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by working`);
    },
    'crime': async function (interaction) {
        const model = interaction.client.models['economy-system']['cooldown'];
        const cooldownModel = await model.findOne({
            where: {
                userId: interaction.user.id,
                command: 'crime'
            }
        });
        if (cooldownModel) {
            return interaction.reply({
                content: interaction.str['cooldown'],
                ephemeral: true
            });
        }
        const cooldown = await model.create({
            userId: interaction.user.id,
            command: 'crime'
        });
        const moneyToAdd = Math.floor(Math.random() * (interaction.config['maxCrimeMoney'] - interaction.config['minCrimeMoney'])) + interaction.config['minCrimeMoney'];
        balance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply({
            content: interaction.str['crimeSuccess'].split('%erned%').join(`${moneyToAdd} ${interaction.config['currencySymbol']}`),
            ephemeral: true
        });
        const cooldownTime = interaction.config['crimeCooldown'] * 60000;
        setTimeout(async () => {
            await cooldown.destroy();
        }, cooldownTime);
        createleaderboard(interaction.client);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.id} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by doing crime`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.id} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by doing crime`);
    },
    'rob': async function (interaction) {
        const model = interaction.client.models['economy-system']['cooldown'];
        const user = await interaction.options.getUser('user');
        const cooldownModel = await model.findOne({
            where: {
                userId: interaction.user.id,
                command: 'rob'
            }
        });
        if (cooldownModel) {
            return interaction.reply({
                content: interaction.strings['cooldown'],
                ephemeral: true
            });
        }
        const cooldown = await model.create({
            userId: interaction.user.id,
            command: 'rob'
        });
        const robbedUser = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        let toRob = robbedUser.balance * (interaction.config['robPercent'] / 100);
        if (toRob >= interaction.config['maxRobAmount']) toRob = interaction.config['maxRobAmount'];
        balance(interaction.client, interaction.user.id, 'add', toRob);
        balance(interaction.client, user.id, 'remove', toRob);
        interaction.reply({
            content: interaction.str['robSuccess'].split('%erned%').join(`${toRob} ${interaction.config['currencySymbol']}`).split('%user%').join(`<@${user.id}>`),
            ephemeral: true
        });
        const cooldownTime = interaction.config['robCooldown'] * 60000;
        setTimeout(async () => {
            await cooldown.destroy();
        }, cooldownTime);
        createleaderboard(interaction.client);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.id} gained ${toRob} ${config['currencySymbol']} by robbing ${user.id}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.id} gained ${toRob} ${config['currencySymbol']} by robbing ${user.id}`);
    },
    'add': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) {
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
        client.logger.info(`[economy-system] The user ${interaction.optins.getUser('user').id} gets added ${interaction.optins.get('amount')} ${config['currencySymbol']} by ${interaction.user.id}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.optins.getUser('user').id} gets added ${interaction.optins.get('amount')} ${config['currencySymbol']} by ${interaction.user.id}`);
    },
    'remove': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) {
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
        client.logger.info(`[economy-system] The user ${interaction.optins.getUser('user').id} gets removed ${interaction.optins.get('amount')} ${config['currencySymbol']} by ${interaction.user.id}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.optins.getUser('user').id} gets removed ${interaction.optins.get('amount')} ${config['currencySymbol']} by ${interaction.user.id}`);
    },
    'set': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) {
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
        client.logger.info(`[economy-system] The balance of the user ${interaction.optins.getUser('user').id} gets set to ${interaction.optins.get('amount')} ${config['currencySymbol']} by ${interaction.user.id}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The balance of the user ${interaction.optins.getUser('user').id} gets set to ${interaction.optins.get('amount')} ${config['currencySymbol']} by ${interaction.user.id}`);
    },
    'daily': async function (interaction) {
        const model = interaction.client.models['economy-system']['cooldown'];
        const cooldownModel = await model.findOne({
            where: {
                userId: interaction.user.id,
                command: 'daily'
            }
        });
        if (cooldownModel) {
            return interaction.reply({
                content: interaction.strings['cooldown'],
                ephemeral: true
            });
        }
        const cooldown = await model.create({
            userId: interaction.user.id,
            command: 'daily'
        });
        balance(interaction.client, interaction.user.id, 'add', interaction.client.configurations['economy-system']['config']['dailyReward']);
        interaction.reply({
            content: `You erned ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming your daily reward`,
            ephemeral: true
        });
        setTimeout(async () => {
            await cooldown.destroy();
        }, 86400000);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.id} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the daily reward`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.id} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the daily reward`);
    },
    'weekly': async function (interaction) {
        const model = interaction.client.models['economy-system']['cooldown'];
        const cooldownModel = await model.findOne({
            where: {
                userId: interaction.user.id,
                command: 'weekly'
            }
        });
        if (cooldownModel) {
            return interaction.reply({
                content: interaction.strings['cooldown'],
                ephemeral: true
            });
        }
        const cooldown = await model.create({
            userId: interaction.user.id,
            command: 'weekly'
        });
        balance(interaction.client, interaction.user.id, 'add', interaction.client.configurations['economy-system']['config']['weeklyReward']);
        interaction.reply({
            content: `You erned ${interaction.client.configurations['economy-system']['config']['weeklyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming your weekly reward`,
            ephemeral: true
        });
        setTimeout(async () => {
            await cooldown.destroy();
        }, 604800000);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.id} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the weekly reward`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.id} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the weekly reward`);
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
        },
        {
            type: 'SUB_COMMAND',
            name: 'daily',
            description: 'Get your daily reward'
        },
        {
            type: 'SUB_COMMAND',
            name: 'weekly',
            description: 'Get your weekly reward'
        }
    ]
};