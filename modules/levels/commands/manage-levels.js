const {registerNeededEdit} = require('../leaderboardChannel');
const {localize} = require('../../../src/functions/localize');
const {formatDiscordUserName} = require('../../../src/functions/helpers');

async function runXPAction(interaction, newXP) {
    const member = interaction.options.getMember('user');
    let user = await interaction.client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) {
        user = await interaction.client.models['levels']['User'].create({
            userID: member.user.id,
            messages: 0,
            xp: 0
        });
    }
    user.xp = newXP(user.xp);
    if (user.xp < 0) return interaction.reply({
        ephemeral: true,
        content: ':warning: ' + localize('levels', 'negative-xp')
    });

    function runXPCheck() {
        const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);
        if (nextLevelXp <= user.xp) {
            user.level = user.level + 1;
            if (interaction.client.configurations.levels.config.reward_roles[user.level.toString()]) {
                if (interaction.client.configurations.levels.config.reward_roles[user.level.toString()]) {
                    for (const role of Object.values(interaction.client.configurations.levels.config.reward_roles)) {
                        if (member.roles.cache.has(role)) member.roles.remove(role, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
                    }
                }
                member.roles.add(interaction.client.configurations.levels.config.reward_roles[user.level.toString()]);
            }
            runXPCheck();
        }
    }

    runXPCheck();


    await user.save();
    interaction.client.logger.info(localize('levels', 'manipulated', {
        u: formatDiscordUserName(interaction.user),
        m: formatDiscordUserName(member.user),
        l: user.level,
        v: user.xp
    }));
    if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'manipulated', {
        u: formatDiscordUserName(interaction.user),
        m: formatDiscordUserName(member.user),
        l: user.level,
        v: user.xp
    }));
    await interaction.reply({
        ephemeral: true,
        content: localize('levels', 'successfully-changed', {
            l: user.level,
            u: member.user.toString(),
            x: user.xp
        })
    });
}

async function runLevelAction(interaction, newLevel) {
    const member = interaction.options.getMember('user');
    const user = await interaction.client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) return interaction.reply({
        ephemeral: true,
        content: ':warning: ' + localize('levels', 'cheat-no-profile')
    });
    user.level = newLevel(user.level);
    if (user.level < 1) return interaction.reply({
        ephemeral: true,
        content: ':warning: ' + localize('levels', 'negative-level')
    });
    user.xp = (user.level - 1) * 750 + ((user.level - 2) * 500);
    if (interaction.client.configurations.levels.config.reward_roles[user.level.toString()]) {
        if (interaction.client.configurations.levels.config.reward_roles[user.level.toString()]) {
            for (const role of Object.values(interaction.client.configurations.levels.config.reward_roles)) {
                if (member.roles.cache.has(role)) member.roles.remove(role, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
            }
        }
        member.roles.add(interaction.client.configurations.levels.config.reward_roles[user.level.toString()]);
    }


    await user.save();
    interaction.client.logger.info(localize('levels', 'manipulated', {
        u: formatDiscordUserName(interaction.user),
        m: formatDiscordUserName(member.user),
        l: user.level,
        v: user.xp
    }));
    if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'manipulated', {
        u: formatDiscordUserName(interaction.user),
        m: formatDiscordUserName(member.user),
        l: user.level,
        v: user.xp
    }));
    await interaction.reply({
        ephemeral: true,
        content: localize('levels', 'successfully-changed', {
            l: user.level,
            u: member.user.toString(),
            x: user.xp
        })
    });
}

module.exports.subcommands = {
    'reset-xp': async function (interaction) {
        const type = interaction.options.getUser('user') ? 'user' : 'server';
        if (!interaction.options.getBoolean('confirm')) return interaction.reply({
            ephemeral: 'true',
            content: type === 'user' ? localize('levels', 'are-you-sure-you-want-to-delete-user-xp', {
                u: interaction.options.getUser('user').toString(),
                ut: formatDiscordUserName(interaction.options.getUser('user'))
            })
                : localize('levels', 'are-you-sure-you-want-to-delete-server-xp')
        });
        await interaction.deferReply();
        if (type === 'user') {
            const user = await interaction.client.models['levels']['User'].findOne({
                where: {
                    userID: interaction.options.getUser('user').id
                }
            });
            if (!user) return interaction.editReply(':warning: ' + localize('levels', 'user-not-found'));
            interaction.client.logger.info(localize('levels', 'user-deleted-users-xp', {
                t: formatDiscordUserName(interaction.user),
                u: user.userID
            }));
            if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'user-deleted-users-xp', {
                t: formatDiscordUserName(interaction.user),
                u: user.userID
            }));
            await user.destroy();
            await interaction.editReply(localize('levels', 'removed-xp-successfully'));
        } else {
            const users = await interaction.client.models['levels']['User'].findAll();
            for (const user of users) await user.destroy();
            interaction.client.logger.info(localize('levels', 'deleted-server-xp', {u: formatDiscordUserName(interaction.user)}));
            if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'deleted-server-xp', {u: formatDiscordUserName(interaction.user)}));
            await interaction.editReply(localize('levels', 'successfully-deleted-all-xp-of-users'));
        }
    },
    'edit-xp': {
        'set': async function (interaction) {
            await runXPAction(interaction, () => {
                return interaction.options.getNumber('value');
            });
        },
        'add': async function (interaction) {
            await runXPAction(interaction, (u) => {
                return u + interaction.options.getNumber('value');
            });
        },
        'remove': async function (interaction) {
            await runXPAction(interaction, (u) => {
                return u - interaction.options.getNumber('value');
            });
        }
    },
    'edit-level': {
        'set': async function (interaction) {
            await runLevelAction(interaction, () => {
                return interaction.options.getNumber('value');
            });
        },
        'add': async function (interaction) {
            await runLevelAction(interaction, (u) => {
                return u + interaction.options.getNumber('value');
            });
        },
        'remove': async function (interaction) {
            await runLevelAction(interaction, (u) => {
                return u - interaction.options.getNumber('value');
            });
        }
    }
};

module.exports.run = function () {
    registerNeededEdit();
};

module.exports.config = {
    name: 'manage-levels',
    description: localize('levels', 'edit-xp-command-description'),
    defaultPermission: false,
    options: function (client) {
        const array = [{
            type: 'SUB_COMMAND',
            name: 'reset-xp',
            description: localize('levels', 'reset-xp-description'),
            options: [
                {
                    type: 'USER',
                    required: false,
                    name: 'user',
                    description: localize('levels', 'reset-xp-user-description')
                },
                {
                    type: 'BOOLEAN',
                    required: false,
                    name: 'confirm',
                    description: localize('levels', 'reset-xp-confirm-description')
                }
            ]
        }];
        if (client.configurations['levels']['config']['allowCheats']) {

            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'edit-xp',
                description: localize('levels', 'edit-xp-description'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'add',
                        description: localize('levels', 'edit-xp-description'),
                        options: [
                            {
                                type: 'USER',
                                required: true,
                                name: 'user',
                                description: localize('levels', 'edit-xp-user-description')
                            },
                            {
                                type: 'NUMBER',
                                required: true,
                                name: 'value',
                                description: localize('levels', 'edit-xp-value-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'remove',
                        description: localize('levels', 'edit-xp-description'),
                        options: [
                            {
                                type: 'USER',
                                required: true,
                                name: 'user',
                                description: localize('levels', 'edit-xp-user-description')
                            },
                            {
                                type: 'NUMBER',
                                required: true,
                                name: 'value',
                                description: localize('levels', 'edit-xp-value-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'set',
                        description: localize('levels', 'edit-xp-description'),
                        options: [
                            {
                                type: 'USER',
                                required: true,
                                name: 'user',
                                description: localize('levels', 'edit-xp-user-description')
                            },
                            {
                                type: 'NUMBER',
                                required: true,
                                name: 'value',
                                description: localize('levels', 'edit-xp-value-description')
                            }
                        ]
                    }
                ]
            });
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'edit-level',
                description: localize('levels', 'edit-level-description'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'add',
                        description: localize('levels', 'edit-xp-description'),
                        options: [
                            {
                                type: 'USER',
                                required: true,
                                name: 'user',
                                description: localize('levels', 'edit-xp-user-description')
                            },
                            {
                                type: 'NUMBER',
                                required: true,
                                name: 'value',
                                description: localize('levels', 'edit-xp-value-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'remove',
                        description: localize('levels', 'edit-xp-description'),
                        options: [
                            {
                                type: 'USER',
                                required: true,
                                name: 'user',
                                description: localize('levels', 'edit-xp-user-description')
                            },
                            {
                                type: 'NUMBER',
                                required: true,
                                name: 'value',
                                description: localize('levels', 'edit-xp-value-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'set',
                        description: localize('levels', 'edit-xp-description'),
                        options: [
                            {
                                type: 'USER',
                                required: true,
                                name: 'user',
                                description: localize('levels', 'edit-xp-user-description')
                            },
                            {
                                type: 'NUMBER',
                                required: true,
                                name: 'value',
                                description: localize('levels', 'edit-xp-value-description')
                            }
                        ]
                    }
                ]
            });
        }
        return array;
    }
};