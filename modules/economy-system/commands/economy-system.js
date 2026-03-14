const {editBalance, editBank, createLeaderboard} = require('../economy-system');
const {
    embedType,
    randomIntFromInterval,
    randomElementFromArray,
    formatDiscordUserName
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.beforeSubcommand = async function (interaction) {
    interaction.str = interaction.client.configurations['economy-system']['strings'];
    interaction.config = interaction.client.configurations['economy-system']['config'];
};

/**
 * Function to handle the cooldown stuff
 * @private
 * @param {string} command The command
 * @param {int} duration The duration of the cooldown (in ms)
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
        if (!await cooldown('work', interaction.config['workCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        const moneyToAdd = randomIntFromInterval(parseInt(interaction.config['maxWorkMoney']), parseInt(interaction.config['minWorkMoney']));
        await editBalance(interaction.client, interaction.user.id, 'add', moneyToAdd);
        interaction.reply(embedType(randomElementFromArray(interaction.str['workSuccess']), {'%earned%': `${moneyToAdd} ${interaction.config['currencySymbol']}`}, {ephemeral: !interaction.config['publicCommandReplies']}));
        createLeaderboard(interaction.client);
        interaction.client.logger.info('[economy-system] ' + localize('economy-system', 'work-earned-money', {
            u: formatDiscordUserName(interaction.user),
            m: moneyToAdd,
            c: interaction.config['currencySymbol']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send('[economy-system] ' + localize('economy-system', 'work-earned-money', {
            u: formatDiscordUserName(interaction.user),
            m: moneyToAdd,
            c: interaction.config['currencySymbol']
        }));
    },
    'crime': async function (interaction) {
        if (!await cooldown('crime', interaction.config['crimeCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        let money;
        if (Math.floor(Math.random() * 2) === 0) {
            const user = await interaction.client.models['economy-system']['Balance'].findOne({
                where: {
                    id: interaction.user.id
                }
            });
            money = (user?.balance || 0) / 2;
            if (money === 0) {
                await editBank(interaction.client, interaction.user.id, 'remove', parseInt(interaction.config['maxCrimeMoney']));
            } else {
                await editBalance(interaction.client, interaction.user.id, 'remove', money);
            }
            interaction.reply(embedType(randomElementFromArray(interaction.str['crimeFail']), {'%loose%': `${money} ${interaction.config['currencySymbol']}`}, {ephemeral: !interaction.config['publicCommandReplies']}));
            interaction.client.logger.info('[economy-system] ' + localize('economy-system', 'crime-loose-money', {
                u: formatDiscordUserName(interaction.user),
                m: money,
                c: interaction.config['currencySymbol']
            }));
            if (interaction.client.logChannel) interaction.client.logChannel.send('[economy-system] ' + localize('economy-system', 'crime-loose-money', {
                u: formatDiscordUserName(interaction.user),
                m: money,
                c: interaction.config['currencySymbol']
            }));
        } else {
            const money = randomIntFromInterval(parseInt(interaction.config['maxCrimeMoney']), parseInt(interaction.config['minCrimeMoney']));
            await editBalance(interaction.client, interaction.user.id, 'add', money);
            interaction.reply(embedType(randomElementFromArray(interaction.str['crimeSuccess']), {'%earned%': `${money} ${interaction.config['currencySymbol']}`}, {ephemeral: !interaction.config['publicCommandReplies']}));
            createLeaderboard(interaction.client);
            interaction.client.logger.info('[economy-system] ' + localize('economy-system', 'crime-earned-money', {
                u: formatDiscordUserName(interaction.user),
                m: money,
                c: interaction.config['currencySymbol']
            }));
            if (interaction.client.logChannel) interaction.client.logChannel.send('[economy-system] ' + localize('economy-system', 'crime-earned-money', {
                u: formatDiscordUserName(interaction.user),
                m: money,
                c: interaction.config['currencySymbol']
            }));
        }
    },
    'rob': async function (interaction) {
        const user = await interaction.options.getUser('user');
        const robbedUser = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        if (!robbedUser) return interaction.reply(embedType(interaction.str['userNotFound'], {'%user%': formatDiscordUserName(user)}), {ephemeral: !interaction.config['publicCommandReplies']});
        if (!await cooldown('rob', interaction.config['robCooldown'] * 60000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        let toRob = parseInt(robbedUser.balance) * (parseInt(interaction.config['robPercent']) / 100);
        if (toRob >= parseInt(interaction.config['maxRobAmount'])) toRob = parseInt(interaction.config['maxRobAmount']);
        await editBalance(interaction.client, interaction.user.id, 'add', toRob);
        await editBalance(interaction.client, user.id, 'remove', toRob);
        interaction.reply(embedType(interaction.str['robSuccess'], {
            '%earned%': `${toRob} ${interaction.config['currencySymbol']}`,
            '%user%': `<@${user.id}>`
        }, {ephemeral: !interaction.config['publicCommandReplies']}));
        createLeaderboard(interaction.client);
        interaction.client.logger.info('[economy-system] ' + localize('economy-system', 'crime-earned-money', {
            u: formatDiscordUserName(interaction.user),
            v: formatDiscordUserName(user),
            m: toRob,
            c: interaction.config['currencySymbol']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send('[economy-system] ' + localize('economy-system', 'crime-earned-money', {
            v: formatDiscordUserName(user),
            u: formatDiscordUserName(interaction.user),
            m: toRob,
            c: interaction.config['currencySymbol']
        }));
    },
    'add': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        console.log(interaction.options.getUser('user').id);
        console.log(interaction.user.id);
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(localize('economy-system', 'admin-self-abuse'));
            return interaction.reply({
                content: localize('economy-system', 'admin-self-abuse-answer', {u: interaction.user.toString()}),
                ephemeral: !interaction.config['publicCommandReplies']
            });
        }
        await editBalance(interaction.client, await interaction.options.getUser('user').id, 'add', parseInt(interaction.options.get('amount')['value']));
        interaction.reply({
            content: localize('economy-system', 'added-money', {
                i: interaction.options.get('amount')['value'],
                c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
                u: formatDiscordUserName(interaction.options.getUser('user'))
            }),
            ephemeral: !interaction.config['publicCommandReplies']
        });

        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'added-money-log', {
            v: formatDiscordUserName(interaction.options.getUser('user')),
            i: interaction.options.get('amount')['value'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
            u: formatDiscordUserName(interaction.user)
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'added-money-log', {
            v: formatDiscordUserName(interaction.options.getUser('user')),
            i: interaction.options.get('amount')['value'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
            u: formatDiscordUserName(interaction.user)
        }));
    },
    'remove': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(localize('economy-system', 'admin-self-abuse'));
            return interaction.reply({
                content: localize('economy-system', 'admin-self-abuse-answer', {u: interaction.user.toString()}),
                ephemeral: !interaction.config['publicCommandReplies']
            });
        }
        await editBalance(interaction.client, interaction.options.getUser('user').id, 'remove', parseInt(interaction.options.get('amount')['value']));
        interaction.reply({
            content: localize('economy-system', 'removed-money', {
                i: interaction.options.get('amount')['value'],
                c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
                u: formatDiscordUserName(interaction.options.getUser('user'))
            }),
            ephemeral: !interaction.config['publicCommandReplies']
        });
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'removed-money-log', {
            v: formatDiscordUserName(interaction.options.getUser('user')),
            i: interaction.options.get('amount')['value'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
            u: formatDiscordUserName(interaction.user)
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'removed-money-log', {
            v: formatDiscordUserName(interaction.options.getUser('user')),
            i: interaction.options.get('amount')['value'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
            u: formatDiscordUserName(interaction.user)
        }));
    },
    'set': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        if (interaction.options.getUser('user').id === interaction.user.id && !interaction.client.configurations['economy-system']['config']['selfBalance']) {
            if (interaction.client.logChannel) interaction.client.logChannel.send(localize('economy-system', 'admin-self-abuse'));
            return interaction.reply({
                content: localize('economy-system', 'admin-self-abuse-answer', {u: interaction.user.toString()}),
                ephemeral: !interaction.config['publicCommandReplies']
            });
        }
        await editBalance(interaction.client, interaction.options.getUser('user').id, 'set', parseInt(interaction.options.get('balance')['value']));
        interaction.reply({
            content: localize('economy-system', 'set-money', {
                i: interaction.options.get('balance')['value'],
                c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
                u: formatDiscordUserName(interaction.options.getUser('user'))
            }),
            ephemeral: !interaction.config['publicCommandReplies']
        });
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'set-money-log', {
            v: formatDiscordUserName(interaction.options.getUser('user')),
            i: interaction.options.get('balance')['value'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
            u: formatDiscordUserName(interaction.user)
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'set-money-log', {
            v: formatDiscordUserName(interaction.options.getUser('user')),
            i: interaction.options.get('balance')['value'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol'],
            u: formatDiscordUserName(interaction.user)
        }));
    },
    'daily': async function (interaction) {
        if (!await cooldown('daily', 86400000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        await editBalance(interaction.client, interaction.user.id, 'add', parseInt(interaction.client.configurations['economy-system']['config']['dailyReward']));
        interaction.reply(embedType(interaction.str['dailyReward'], {'%earned%': `${interaction.client.configurations['economy-system']['config']['dailyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, {ephemeral: !interaction.config['publicCommandReplies']}));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'daily-earned-money', {
            u: formatDiscordUserName(interaction.user),
            m: interaction.client.configurations['economy-system']['config']['dailyReward'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'daily-earned-money', {
            u: formatDiscordUserName(interaction.user),
            m: interaction.client.configurations['economy-system']['config']['dailyReward'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol']
        }));
    },
    'weekly': async function (interaction) {
        if (!await cooldown('weekly', 604800000, interaction.user.id, interaction.client)) return interaction.reply(embedType(interaction.str['cooldown'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        await editBalance(interaction.client, interaction.user.id, 'add', parseInt(interaction.client.configurations['economy-system']['config']['weeklyReward']));
        interaction.reply(embedType(interaction.str['weeklyReward'], {'%earned%': `${interaction.client.configurations['economy-system']['config']['weeklyReward']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`}, {ephemeral: !interaction.config['publicCommandReplies']}));
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'weekly-earned-money', {
            u: formatDiscordUserName(interaction.user),
            m: interaction.client.configurations['economy-system']['config']['dailyReward'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol']
        }));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'weekly-earned-money', {
            u: formatDiscordUserName(interaction.user),
            m: interaction.client.configurations['economy-system']['config']['dailyReward'],
            c: interaction.client.configurations['economy-system']['config']['currencySymbol']
        }));
    },
    'balance': async function (interaction) {
        let user = interaction.options.getUser('user');
        if (!user) user = interaction.user;
        const balanceV = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: user.id
            }
        });
        if (!balanceV) return interaction.reply(embedType(interaction.str['userNotFound'], {'%user%': formatDiscordUserName(user)}), {ephemeral: !interaction.config['publicCommandReplies']});
        interaction.reply(embedType(interaction.str['balanceReply'], {
            '%user%': formatDiscordUserName(user),
            '%balance%': `${balanceV['balance']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`,
            '%bank%': `${balanceV['bank']} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`,
            '%total%': `${parseInt(balanceV['balance']) + parseInt(balanceV['bank'])} ${interaction.client.configurations['economy-system']['config']['currencySymbol']}`
        }, {ephemeral: !interaction.config['publicCommandReplies']}));
    },
    'deposit': async function (interaction) {
        let amount = interaction.options.get('amount')['value'];
        const user = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: interaction.user.id
            }
        });
        if (amount === 'all') amount = user.balance;
        if (isNaN(amount)) return interaction.reply(embedType(interaction.str['NaN'], {'%input%': amount}, {ephemeral: !interaction.config['publicCommandReplies']}));
        await editBank(interaction.client, interaction.user.id, 'deposit', amount);
        interaction.reply(embedType(interaction.str['depositMsg'], {'%amount%': amount}, {ephemeral: !interaction.config['publicCommandReplies']}));
    },
    'withdraw': async function (interaction) {
        let amount = interaction.options.get('amount')['value'];
        const user = await interaction.client.models['economy-system']['Balance'].findOne({
            where: {
                id: interaction.user.id
            }
        });
        if (amount === 'all') amount = user.bank;
        if (isNaN(amount)) return interaction.reply(embedType(interaction.str['NaN'], {'%input%': amount}, {ephemeral: !interaction.config['publicCommandReplies']}));
        await editBank(interaction.client, interaction.user.id, 'withdraw', amount);
        interaction.reply(embedType(interaction.str['withdrawMsg'], {'%amount%': amount}, {ephemeral: !interaction.config['publicCommandReplies']}));
    },
    'msg_drop_msg': {
        'enable': async function (interaction) {
            const user = await interaction.client.models['economy-system']['dropMsg'].findOne({
                where: {
                    id: interaction.user.id
                }
            });
            if (!user) return interaction.reply(embedType(interaction.str['msgDropAlreadyEnabled'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
            await user.destroy();
            interaction.reply(embedType(interaction.str['msgDropEnabled'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        },
        'disable': async function (interaction) {
            const user = await interaction.client.models['economy-system']['dropMsg'].findOne({
                where: {
                    id: interaction.user.id
                }
            });
            if (user) return interaction.reply(embedType(interaction.str['msgDropAlreadyDisabled'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
            await interaction.client.models['economy-system']['dropMsg'].create({
                id: interaction.user.id
            });
            interaction.reply(embedType(interaction.str['msgDropDisabled'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        }
    },
    'destroy': async function (interaction) {
        if (!interaction.client.configurations['economy-system']['config']['admins'].includes(interaction.user.id) && !interaction.client.config['botOperators'].includes(interaction.user.id)) return interaction.reply(embedType(interaction.client.strings['not_enough_permissions'], {}, {ephemeral: !interaction.config['publicCommandReplies']}));
        if (!interaction.options.getBoolean('confirm')) return interaction.reply({
            content: localize('economy-system', 'destroy-cancel-reply'),
            ephemeral: !interaction.config['publicCommandReplies']
        });
        interaction.reply({
            content: localize('economy-system', 'destroy-reply'),
            ephemeral: !interaction.config['publicCommandReplies']
        });
        interaction.client.logger.info(`[economy-system] Destroying the whole economy, as requested by ${formatDiscordUserName(interaction.user)}`);
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] Destroying the whole economy, as requested by ${formatDiscordUserName(interaction.user)}`);
        const cooldownModels = await interaction.client.models['economy-system']['cooldown'].findAll();
        if (cooldownModels.length !== 0) {
            cooldownModels.forEach(async (element) => {
                await element.destroy();
            });
        }
        const msgDropModels = await interaction.client.models['economy-system']['dropMsg'].findAll();
        if (msgDropModels.length !== 0) {
            msgDropModels.forEach(async (element) => {
                await element.destroy();
            });
        }
        const shopModels = await interaction.client.models['economy-system']['Shop'].findAll();
        if (shopModels.length !== 0) {
            shopModels.forEach(async (element) => {
                await element.destroy();
            });
        }
        const userModels = await interaction.client.models['economy-system']['Balance'].findAll();
        if (userModels.length !== 0) {
            userModels.forEach(async (element) => {
                await element.destroy();
            });
        }
        interaction.client.logger.info(`[economy-system] ` + localize('economy-system', 'destroy', {u: formatDiscordUserName(interaction.user)}));
        if (interaction.client.logChannel) interaction.client.logChannel.send(`[economy-system] ` + localize('economy-system', 'destroy', {u: formatDiscordUserName(interaction.user)}));
    }
};

module.exports.config = {
    name: 'economy',
    description: localize('economy-system', 'command-description-main'),

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
        },
        {
            type: 'SUB_COMMAND',
            name: 'deposit',
            description: localize('economy-system', 'command-description-deposit'),
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'amount',
                    description: localize('economy-system', 'option-description-amount-deposit')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'withdraw',
            description: localize('economy-system', 'command-description-withdraw'),
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'amount',
                    description: localize('economy-system', 'option-description-amount-withdraw')
                }
            ]
        },
        {
            type: 'SUB_COMMAND_GROUP',
            name: 'msg_drop_msg',
            description: localize('economy-system', 'command-group-description-msg-drop-msg'),
            options: [
                {
                    type: 'SUB_COMMAND',
                    name: 'enable',
                    description: localize('economy-system', 'command-description-msg-drop-msg-enable')
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'disable',
                    description: localize('economy-system', 'command-description-msg-drop-msg-disable')
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
            array.push({
                type: 'SUB_COMMAND',
                name: 'destroy',
                description: localize('economy-system', 'command-description-destroy'),
                options: [
                    {
                        type: 'BOOLEAN',
                        required: false,
                        name: 'confirm',
                        description: localize('economy-system', 'option-description-confirm')
                    }
                ]
            });
        }
        return array;
    }
};