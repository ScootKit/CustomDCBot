const {balance, createleaderboard} = require('../economy-system');
const {embedType} = require('../../../src/functions/helpers');

module.exports.beforeSubcommand = async function (interaction) {
    interaction.str = interaction.client.configurations['economy-system']['strings'];
    interaction.config = interaction.client.configurations['economy-system']['config'];
};

/**
 * Function to handle the cooldown stuff
 * @private
 * @param {string} command The command
 * @param {integer} duration The duration of the cooldown (in ms)
 * @param {userId} userId Id of the User
 * @returns {Promise<boolean>}
 */
async function cooldown (command, duration, userId, client) {
    const model = client.models['economy-system']['cooldown'];
    const cooldownModel = await model.findOne({
        where: {
            userId: userId,
            command: command
        }
    });
    if (cooldownModel) {
        // check cooldown duration
        if (cooldownModel.timestamp.getTime() + duration > Date.now()) return false;
        cooldownModel.timestamp = new Date();
        await cooldownModel.save();
        return true;
    } else {
        // create the model
        await model.create({
            userId: userId,
            command: command,
            timestamp: new Date()
        });
        return true;
    }
}

module.exports.subcommands = {
    'work': async function (interaction) {
        if (!await cooldown('work', interaction.config['workCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        const moneyToAdd = Math.floor(Math.random() * (interaction.config['maxWorkMoney'] - interaction.config['minWorkMoney'])) + interaction.config['minWorkMoney'];
        await balance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply(embedType(interaction.str['workSuccess'], {'%earned%': `${moneyToAdd} ${interaction.config['currencySymbol']}`}, { ephemeral: true }));
        createleaderboard(interaction.client);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by working`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by working`);
    },
    'crime': async function (interaction) {
        if (!await cooldown('crime', interaction.config['crimeCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        const moneyToAdd = Math.floor(Math.random() * (interaction.config['maxCrimeMoney'] - interaction.config['minCrimeMoney'])) + interaction.config['minCrimeMoney'];
        await balance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply(embedType(interaction.str['crimeSuccess'], {'%earned%': `${moneyToAdd} ${interaction.config['currencySymbol']}`}, { ephemeral: true }));
        createleaderboard(interaction.client);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by doing crime`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${moneyToAdd} ${interaction.config['currencySymbol']} by doing crime`);
    },
    'rob': async function (interaction) {
        if (!await cooldown('rob', interaction.config['robCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        const user = await interaction.options.getUser('user');
        const robbedUser = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        let toRob = robbedUser.balance * (interaction.config['robPercent'] / 100);
        if (toRob >= interaction.config['maxRobAmount']) toRob = interaction.config['maxRobAmount'];
        await balance(interaction.client, interaction.user.id, 'add', toRob);
        await balance(interaction.client, user.id, 'remove', toRob);
        interaction.reply(embedType(interaction.str['robSuccess'], {'%earned%': `${toRob} ${interaction.config['currencySymbol']}`, '%user%': `<@${user.id}>`}, { ephemeral: true }));
        createleaderboard(interaction.client);
        const member = await interaction.client.users.fetch(user.id);
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${toRob} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by robbing ${member.username}#${member.discriminator}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${toRob} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by robbing ${member.username}#${member.discriminator}`);
    },
    'add': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, { ephemeral: true }));
        if (!interaction.client.configurations['economy-system']['config']['allowCheats']) return interaction.reply({
            content: 'This command isn`t enabled',
            ephemeral: true
        });
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(`The admin ${interaction.user.username} wanted to abuse the permissions. This can't be ignored!`);
            return interaction.reply({
                content: `What a bad admin you are, ${interaction.user.username}. I'm disappointed with you! I need to report this. If I could i would ban you!`,
                ephemeral: true
            });
        }
        await balance(interaction.client, await interaction.options.getUser('user').id, 'add', parseInt(interaction.options.get('amount')['value']));
        interaction.reply({
            content: `${interaction.options.get('amount')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} has been added to the balance of ${interaction.options.getUser('user').username}`,
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] The user ${interaction.options.getUser('user').username}#${interaction.options.getUser('user').discriminator} gets added ${interaction.options.get('amount')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by ${interaction.user.username}#${interaction.user.discriminator}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.options.getUser('user').username}#${interaction.options.getUser('user').discriminator} gets added ${interaction.options.get('amount')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by ${interaction.user.username}#${interaction.user.discriminator}`);
    },
    'remove': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, { ephemeral: true }));
        if (!interaction.client.configurations['economy-system']['config']['allowCheats']) return interaction.reply({
            content: 'This command isn`t enabled',
            ephemeral: true
        });
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(`The admin ${interaction.user.name} wanted to abuse the permissions. This can't be ignored!`);
            return interaction.reply({
                content: `What a bad admin you are, ${interaction.user.name}. I'm disappointed with you! I need to report this. If I could i would ban you!`,
                ephemeral: true
            });
        }
        await balance(interaction.client, interaction.options.getUser('user').id, 'remove', parseInt(interaction.options.get('amount')['value']));
        interaction.reply({
            content: `${interaction.options.get('amount')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} has been removed from the balance of ${interaction.options.getUser('user').username}`,
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] The user ${interaction.options.getUser('user').username}#${interaction.options.getUser('user').discriminator} gets removed ${interaction.options.get('amount')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by ${interaction.user.username}#${interaction.user.discriminator}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.options.getUser('user').username}#${interaction.options.getUser('user').discriminator} gets removed ${interaction.options.get('amount')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by ${interaction.user.username}#${interaction.user.discriminator}`);
    },
    'set': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, { ephemeral: true }));
        if (!interaction.client.configurations['economy-system']['config']['allowCheats']) return interaction.reply({
            content: 'This command isn`t enabled',
            ephemeral: true
        });
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(`The admin ${interaction.user.name} wanted to abuse the permissions. This can't be ignored!`);
            return interaction.reply({
                content: `What a bad admin you are, ${interaction.user.name}. I'm disappointed with you! I need to report this. If I could i would ban you!`,
                ephemeral: true
            });
        }
        await balance(interaction.client, interaction.options.getUser('user').id, 'set', parseInt(interaction.options.get('balance')['value']));
        interaction.reply({
            content: `The balance of the user ${interaction.options.getUser('user').username} has been set to ${interaction.options.get('balance')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`,
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] The balance of the user ${interaction.options.getUser('user').username}#${interaction.options.getUser('user').discriminator} gets set to ${interaction.options.get('balance')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by ${interaction.user.username}#${interaction.user.discriminator}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The balance of the user ${interaction.options.getUser('user').username}#${interaction.options.getUser('user').discriminator} gets set to ${interaction.options.get('balance')['value']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by ${interaction.user.username}#${interaction.user.discriminator}`);
    },
    'daily': async function (interaction) {
        if (!await cooldown('daily', 86400000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        await balance(interaction.client, interaction.user.id, 'add', interaction.client.configurations['economy-system']['config']['dailyReward']);
        interaction.reply(embedType(interaction.str['dailyReward'], {'%earned%': `${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, { ephemeral: true }));
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the daily reward`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the daily reward`);
    },
    'weekly': async function (interaction) {
        if (!await cooldown('weekly', 604800000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        await balance(interaction.client, interaction.user.id, 'add', interaction.client.configurations['economy-system']['config']['weeklyReward']);
        interaction.reply(embedType(interaction.str['weeklyReward'], {'%earned%': `${interaction.client.configurations['economy-system']['config']['weeklyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, { ephemeral: true }));
        interaction.client.logger.info(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the weekly reward`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] The user ${interaction.user.username}#${interaction.user.discriminator} gained ${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']} by claiming the weekly reward`);
    },
    'balance': async function (interaction) {
        let user = interaction.options.getUser('user');
        if (!user) user = interaction.user;
        const balanceV = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        if (!balanceV) return interaction.reply(embedType(interaction.str['userNotFound']), {'%user%': `${interaction.user.username}#${interaction.user.discriminator}`});
        interaction.reply(embedType(interaction.str['balanceReply'], {'%user%': `${user.username}#${user.discriminator}`, '%balance%': `${balanceV['dataValues']['balance']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, { ephemeral: true }));
    }
};

module.exports.config = {
    name: 'economy-system',
    description: 'general economy-system',
    defaultPermission: true,
    options: function (client) {
        const array = [{
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
            name: 'daily',
            description: 'Get your daily reward'
        },
        {
            type: 'SUB_COMMAND',
            name: 'weekly',
            description: 'Get your weekly reward'
        },
        {
            type: 'SUB_COMMAND',
            name: 'balance',
            description: 'Show the balance of yourself and other users',
            options: [
                {
                    type: 'USER',
                    required: false,
                    name: 'user',
                    description: 'User to show the balance of. (Leave empty to show your own)'
                }
            ]
        }];
        if (client.configurations['economy-system']['config']['allowCheats']) {
            array.push({
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
            });
            array.push({
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
            });
            array.push({
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
            });
        }
        return array;
    }
};