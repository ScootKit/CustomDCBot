const {balance, createleaderboard} = require('../economy-system');
const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

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
 * @param {Client} client Client
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
        interaction.client.logger.info('[economy-system] ' + localize('economy-system', 'work-earned-money', {u: interaction.user.tag, m: moneyToAdd, c: interaction.config['currencySymbol']}));
        if (interaction.client.logChannel) interaction.client.logChannel.send('[economy-system] ' + localize('economy-system', 'work-earned-money', {u: interaction.user.tag, m: moneyToAdd, c: interaction.config['currencySymbol']}));
    },
    'crime': async function (interaction) {
        if (!await cooldown('crime', interaction.config['crimeCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        const moneyToAdd = Math.floor(Math.random() * (interaction.config['maxCrimeMoney'] - interaction.config['minCrimeMoney'])) + interaction.config['minCrimeMoney'];
        await balance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply(embedType(interaction.str['crimeSuccess'], {'%earned%': `${moneyToAdd} ${interaction.config['currencySymbol']}`}, { ephemeral: true }));
        createleaderboard(interaction.client);
        interaction.client.logger.info('[economy-system] ' + localize('economy-system', 'crime-earned-money', {u: interaction.user.tag, m: moneyToAdd, c: interaction.config['currencySymbol']}));
        if (interaction.client.logChannel) interaction.client.logChannel.send('[economy-system] ' + localize('economy-system', 'crime-earned-money', {u: interaction.user.tag, m: moneyToAdd, c: interaction.config['currencySymbol']}));
    },
    'rob': async function (interaction) {
        const user = await interaction.options.getUser('user');
        const robbedUser = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        if (!robbedUser) return interaction.reply(embedType(interaction.str['userNotFound']), {'%user%': `${interaction.user.username}#${interaction.user.discriminator}`}, { ephemeral: true });
        if (!await cooldown('rob', interaction.config['robCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        let toRob = robbedUser.balance * (interaction.config['robPercent'] / 100);
        if (toRob >= interaction.config['maxRobAmount']) toRob = interaction.config['maxRobAmount'];
        await balance(interaction.client, interaction.user.id, 'add', toRob);
        await balance(interaction.client, user.id, 'remove', toRob);
        interaction.reply(embedType(interaction.str['robSuccess'], {'%earned%': `${toRob} ${interaction.config['currencySymbol']}`, '%user%': `<@${user.id}>`}, { ephemeral: true }));
        createleaderboard(interaction.client);
        interaction.client.logger.info('[economy-system] ' + localize('economy-system', 'crime-earned-money', {u: interaction.user.tag, v: user.tag, m: toRob, c: interaction.config['currencySymbol']}));
        if (interaction.client.logChannel) interaction.client.logChannel.send('[economy-system] ' + localize('economy-system', 'crime-earned-money', {v: user.tag, u: interaction.user.tag, m: toRob, c: interaction.config['currencySymbol']}));
    },
    'add': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, { ephemeral: true }));
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(localize('economy-system', 'admin-self-abuse'));
            return interaction.reply({
                content: localize('economy-system', 'admin-self-abuse-answer'),
                ephemeral: true
            });
        }
        await balance(interaction.client, await interaction.options.getUser('user').id, 'add', parseInt(interaction.options.get('amount')['value']));
        interaction.reply({
            content: localize('economy-system', 'added-money', {i: interaction.options.get('amount')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.options.getUser('user').toString}),
            ephemeral: true
        });

        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'added-money-log', {v: interaction.options.getUser('user').tag, i: interaction.options.get('amount')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.user.tag}));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'added-money-log', {v: interaction.options.getUser('user').tag, i: interaction.options.get('amount')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.user.tag}));
    },
    'remove': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, { ephemeral: true }));
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(localize('economy-system', 'admin-self-abuse'));
            return interaction.reply({
                content: localize('economy-system', 'admin-self-abuse-answer'),
                ephemeral: true
            });
        }
        await balance(interaction.client, interaction.options.getUser('user').id, 'remove', parseInt(interaction.options.get('amount')['value']));
        interaction.reply({
            content: localize('economy-system', 'removed-money', {i: interaction.options.get('amount')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.options.getUser('user').toString}),
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'removed-money-log', {v: interaction.options.getUser('user').tag, i: interaction.options.get('amount')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.user.tag}));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'removed-money-log', {v: interaction.options.getUser('user').tag, i: interaction.options.get('amount')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.user.tag}));
    },
    'set': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, { ephemeral: true }));
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(localize('economy-system', 'admin-self-abuse'));
            return interaction.reply({
                content: localize('economy-system', 'admin-self-abuse-answer'),
                ephemeral: true
            });
        }
        await balance(interaction.client, interaction.options.getUser('user').id, 'set', parseInt(interaction.options.get('balance')['value']));
        interaction.reply({
            content: localize('economy-system', 'set-money', {i: interaction.options.get('balance')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.options.getUser('user').toString}),
            ephemeral: true
        });
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'set-money-log', {v: interaction.options.getUser('user').tag, i: interaction.options.get('balance')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.user.tag}));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'set-money-log', {v: interaction.options.getUser('user').tag, i: interaction.options.get('balance')['value'], c: interaction.client.configurations['economy-system']['config']['currencySymbol'], u: interaction.user.tag}));
    },
    'daily': async function (interaction) {
        if (!await cooldown('daily', 86400000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        await balance(interaction.client, interaction.user.id, 'add', interaction.client.configurations['economy-system']['config']['dailyReward']);
        interaction.reply(embedType(interaction.str['dailyReward'], {'%earned%': `${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, { ephemeral: true }));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'daily-earned-money', {u: interaction.user.tag, m: interaction.client.configurations['economy-system']['config']['dailyReward'], c: interaction.client.configurations['economy-system']['config']['currencySymbol']}));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'daily-earned-money', {u: interaction.user.tag, m: interaction.client.configurations['economy-system']['config']['dailyReward'], c: interaction.client.configurations['economy-system']['config']['currencySymbol']}));
    },
    'weekly': async function (interaction) {
        if (!await cooldown('weekly', 604800000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, { ephemeral: true }));
        await balance(interaction.client, interaction.user.id, 'add', interaction.client.configurations['economy-system']['config']['weeklyReward']);
        interaction.reply(embedType(interaction.str['weeklyReward'], {'%earned%': `${interaction.client.configurations['economy-system']['config']['weeklyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, { ephemeral: true }));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'weekly-earned-money', {u: interaction.user.tag, m: interaction.client.configurations['economy-system']['config']['dailyReward'], c: interaction.client.configurations['economy-system']['config']['currencySymbol']}));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'weekly-earned-money', {u: interaction.user.tag, m: interaction.client.configurations['economy-system']['config']['dailyReward'], c: interaction.client.configurations['economy-system']['config']['currencySymbol']}));
    },
    'balance': async function (interaction) {
        let user = interaction.options.getUser('user');
        if (!user) user = interaction.user;
        const balanceV = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        if (!balanceV) return interaction.reply(embedType(interaction.str['userNotFound']), {'%user%': `${interaction.user.username}#${interaction.user.discriminator}`}, { ephemeral: true });
        interaction.reply(embedType(interaction.str['balanceReply'], {'%user%': `${user.username}#${user.discriminator}`, '%balance%': `${balanceV['dataValues']['balance']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, { ephemeral: true }));
    }
};

module.exports.config = {
    name: 'economy',
    description: localize('economy-system', 'command-description-main'),
    defaultPermission: true,
    options: function (client) {
        const array = [{
            type: 'SUB_COMMAND',
            name: 'work',
            description: localize('economy-system', 'command-description-work')
        },
        {
            type: 'SUB_COMMAND',
            name: 'crime',
            description: localize('economy-system', 'command-description-crime')
        },
        {
            type: 'SUB_COMMAND',
            name: 'rob',
            description: localize('economy-system', 'command-description-rob'),
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: localize('economy-system', 'option-description-rob-user')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'daily',
            description: localize('economy-system', 'command-description-daily')
        },
        {
            type: 'SUB_COMMAND',
            name: 'weekly',
            description: localize('economy-system', 'command-description-weekly')
        },
        {
            type: 'SUB_COMMAND',
            name: 'balance',
            description: localize('economy-system', 'command-description-balance'),
            options: [
                {
                    type: 'USER',
                    required: false,
                    name: 'user',
                    description: localize('economy-system', 'option-description-user')
                }
            ]
        }];
        if (client.configurations['economy-system']['config']['allowCheats']) {
            array.push({
                type: 'SUB_COMMAND',
                name: 'add',
                description: localize('economy-system', 'command-description-add'),
                options: [
                    {
                        type: 'USER',
                        required: true,
                        name: 'user',
                        description: localize('economy-system', 'option-description-user')
                    },
                    {
                        type: 'INTEGER',
                        required: true,
                        name: 'amount',
                        description: localize('economy-system', 'option-description-amount')
                    }
                ]
            });
            array.push({
                type: 'SUB_COMMAND',
                name: 'remove',
                description: localize('economy-system', 'command-description-remove'),
                options: [
                    {
                        type: 'USER',
                        required: true,
                        name: 'user',
                        description: localize('economy-system', 'option-description-user')
                    },
                    {
                        type: 'INTEGER',
                        required: true,
                        name: 'amount',
                        description: localize('economy-system', 'option-description-amount')
                    }
                ]
            });
            array.push({
                type: 'SUB_COMMAND',
                name: 'set',
                description: localize('economy-system', 'command-description-set'),
                options: [
                    {
                        type: 'USER',
                        required: true,
                        name: 'user',
                        description: localize('economy-system', 'option-description-user')
                    },
                    {
                        type: 'INTEGER',
                        required: true,
                        name: 'balance',
                        description: localize('economy-system', 'option-description-balance')
                    }
                ]
            });
        }
        return array;
    }
};