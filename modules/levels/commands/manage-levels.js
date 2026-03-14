const fs = require('fs');
const path = require('path');
const jsonfile = require('jsonfile');
const {registerNeededEdit} = require('../leaderboardChannel');
const {localize} = require('../../../src/functions/localize');
const {formatDiscordUserName} = require('../../../src/functions/helpers');
const {calculateLevelXP, displayLevel} = require('../events/messageCreate');
const {reloadConfig} = require('../../../src/functions/configuration');
const {getReplaceableRewardRoleIds} = require('../rewards');

function rewardsCommandsEnabled(client) {
    const config = client.configurations?.levels?.config || {};
    return config.enableRewardCommands !== false;
}

function getRewardsConfigPath(client) {
    return path.join(client.configDir, 'levels', 'reward-roles.json');
}

function ensureRewardsDir(client) {
    const dir = path.join(client.configDir, 'levels');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
}

function readRewards(client) {
    const filePath = getRewardsConfigPath(client);
    try {
        const data = jsonfile.readFileSync(filePath);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function writeRewards(client, rewards) {
    ensureRewardsDir(client);
    jsonfile.writeFileSync(getRewardsConfigPath(client), rewards, {spaces: 2});
}

function collectRoles(interaction) {
    const roles = [
        interaction.options.getRole('role', true),
        interaction.options.getRole('role2'),
        interaction.options.getRole('role3'),
        interaction.options.getRole('role4'),
        interaction.options.getRole('role5')
    ].filter(Boolean).map(r => r.id);
    return [...new Set(roles)];
}

function formatRoles(roleIds) {
    if (!roleIds || roleIds.length === 0) return localize('levels', 'rewards-none');
    return roleIds.map(id => `<@&${id}>`).join(', ');
}

function findEntry(rewards, level) {
    return rewards.find(r => parseInt(r.level) === level);
}

async function saveAndReload(interaction, rewards) {
    writeRewards(interaction.client, rewards);
    await reloadConfig(interaction.client);
}

function ensureRewardsCommandsEnabled(interaction) {
    if (rewardsCommandsEnabled(interaction.client)) return true;
    interaction.reply({ephemeral: true, content: localize('levels', 'rewards-commands-disabled')});
    return false;
}

async function runXPAction(interaction, newXP) {
    await interaction.deferReply({
        ephemeral: true
    });

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
    if (user.xp < 0) return interaction.editReply({
        content: '⚠️ ' + localize('levels', 'negative-xp')
    });

    async function runXPCheck() {
        const nextLevelXp = calculateLevelXP(interaction.client, user.level + 1);
        if (nextLevelXp <= user.xp) {
            user.level = user.level + 1;
            await fixLevelRoles(interaction, member, user.level);
            await runXPCheck();
        }
    }

    await runXPCheck();


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
    await interaction.editReply({
        content: localize('levels', 'successfully-changed', {
            l: user.level,
            u: member.user.toString(),
            x: user.xp
        })
    });
}

async function fixLevelRoles(interaction, member, level) {
    const moduleConfig = interaction.client.configurations['levels']['config'];
    const adjustedLevel = level - (moduleConfig.startFromZero ? 1 : 0);
    if (adjustedLevel < 0) return;

    const rewardEntries = Array.isArray(interaction.client.configurations?.levels?.['reward-roles'])
        ? interaction.client.configurations.levels['reward-roles']
        : [];
    if (rewardEntries.length > 0) {
        const sorted = rewardEntries
            .slice()
            .sort((a, b) => parseInt(a.level) - parseInt(b.level));
        for (const entry of sorted) {
            const entryLevel = parseInt(entry.level);
            if (!Number.isFinite(entryLevel) || entryLevel > adjustedLevel) continue;
            const roles = Array.isArray(entry.roles) ? entry.roles.filter(Boolean) : [];
            if (roles.length === 0) continue;
            if (entry.replacePrevious) {
                for (const roleId of getReplaceableRewardRoleIds(interaction.client)) {
                    if (member.roles.cache.has(roleId)) {
                        await member.roles.remove(roleId, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
                    }
                }
            }
            await member.roles.add(roles, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
        }
        return;
    }

    let highest = null;
    for (const key in moduleConfig.reward_roles) {
        const role = moduleConfig.reward_roles[key];
        if (parseInt(key) <= adjustedLevel) {
            if (highest && highest < parseInt(key) && moduleConfig.onlyTopLevelRole) {
                await member.roles.remove(moduleConfig.reward_roles[highest.toString()], '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
            }
            highest = parseInt(key);
            await member.roles.add(role, '[levels] ' + localize('levels', 'granted-rewards-audit-log'));
        } else if (member.roles.cache.has(role)) {
            await member.roles.remove(role, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
        }
    }
}

async function runLevelAction(interaction, newLevel) {
    await interaction.deferReply({ephemeral: true});

    const member = interaction.options.getMember('user');
    const user = await interaction.client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) return interaction.editReply({
        content: '⚠️ ' + localize('levels', 'cheat-no-profile')
    });
    user.level = newLevel(user.level);
    if (interaction.client.configurations['levels']['config'].startFromZero) user.level = user.level + 1;
    if (user.level < 1) return interaction.editReply({
        content: '⚠️ ' + localize('levels', 'negative-level')
    });
    user.xp = calculateLevelXP(interaction.client, user.level);

    await fixLevelRoles(interaction, member, user.level);

    await user.save();
    interaction.client.logger.info(localize('levels', 'manipulated', {
        u: formatDiscordUserName(interaction.user),
        m: formatDiscordUserName(member.user),
        l: displayLevel(user.level, interaction.client),
        v: user.xp
    }));
    if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'manipulated', {
        u: formatDiscordUserName(interaction.user),
        m: formatDiscordUserName(member.user),
        l: displayLevel(user.level, interaction.client),
        v: user.xp
    }));
    await interaction.editReply({
        content: localize('levels', 'successfully-changed', {
            l: displayLevel(user.level, interaction.client),
            u: member.user.toString(),
            x: user.xp
        })
    });
}

module.exports.subcommands = {
    'rewards': {
        'add': async function (interaction) {
            if (!ensureRewardsCommandsEnabled(interaction)) return;
            const level = interaction.options.getInteger('level', true);
            const roles = collectRoles(interaction);
            const replacePrevious = interaction.options.getBoolean('replaceprevious');

            const rewards = readRewards(interaction.client);
            let entry = findEntry(rewards, level);
            if (!entry) {
                entry = {level, roles: [], replacePrevious: false};
                rewards.push(entry);
            }
            entry.roles = [...new Set([...(entry.roles || []), ...roles])];
            if (typeof replacePrevious === 'boolean') entry.replacePrevious = replacePrevious;

            await saveAndReload(interaction, rewards);
            return interaction.reply({
                ephemeral: true,
                content: localize('levels', 'rewards-added', {
                    l: level,
                    roles: formatRoles(entry.roles),
                    replace: entry.replacePrevious ? localize('levels', 'rewards-replace-on') : localize('levels', 'rewards-replace-off')
                })
            });
        },
        'set': async function (interaction) {
            if (!ensureRewardsCommandsEnabled(interaction)) return;
            const level = interaction.options.getInteger('level', true);
            const roles = collectRoles(interaction);
            const replacePrevious = interaction.options.getBoolean('replaceprevious');

            const rewards = readRewards(interaction.client);
            let entry = findEntry(rewards, level);
            if (!entry) {
                entry = {level, roles: [], replacePrevious: false};
                rewards.push(entry);
            }
            entry.roles = roles;
            if (typeof replacePrevious === 'boolean') entry.replacePrevious = replacePrevious;

            await saveAndReload(interaction, rewards);
            return interaction.reply({
                ephemeral: true,
                content: localize('levels', 'rewards-set', {
                    l: level,
                    roles: formatRoles(entry.roles),
                    replace: entry.replacePrevious ? localize('levels', 'rewards-replace-on') : localize('levels', 'rewards-replace-off')
                })
            });
        },
        'remove': async function (interaction) {
            if (!ensureRewardsCommandsEnabled(interaction)) return;
            const level = interaction.options.getInteger('level', true);
            const role = interaction.options.getRole('role', true);

            const rewards = readRewards(interaction.client);
            const entry = findEntry(rewards, level);
            if (!entry) {
                return interaction.reply({ephemeral: true, content: localize('levels', 'rewards-level-not-found', {l: level})});
            }
            entry.roles = (entry.roles || []).filter(r => r !== role.id);
            if (entry.roles.length === 0) {
                const idx = rewards.indexOf(entry);
                if (idx >= 0) rewards.splice(idx, 1);
            }

            await saveAndReload(interaction, rewards);
            return interaction.reply({
                ephemeral: true,
                content: localize('levels', 'rewards-removed', {
                    l: level,
                    role: role.toString()
                })
            });
        },
        'clear': async function (interaction) {
            if (!ensureRewardsCommandsEnabled(interaction)) return;
            const level = interaction.options.getInteger('level', true);
            const rewards = readRewards(interaction.client);
            const before = rewards.length;
            const filtered = rewards.filter(r => parseInt(r.level) !== level);
            if (filtered.length === before) {
                return interaction.reply({ephemeral: true, content: localize('levels', 'rewards-level-not-found', {l: level})});
            }
            await saveAndReload(interaction, filtered);
            return interaction.reply({ephemeral: true, content: localize('levels', 'rewards-cleared', {l: level})});
        },
        'list': async function (interaction) {
            if (!ensureRewardsCommandsEnabled(interaction)) return;
            const level = interaction.options.getInteger('level');
            const rewards = readRewards(interaction.client);

            if (level) {
                const entry = findEntry(rewards, level);
                if (!entry) {
                    return interaction.reply({ephemeral: true, content: localize('levels', 'rewards-level-not-found', {l: level})});
                }
                return interaction.reply({
                    ephemeral: true,
                    content: localize('levels', 'rewards-list-one', {
                        l: level,
                        roles: formatRoles(entry.roles || []),
                        replace: entry.replacePrevious ? localize('levels', 'rewards-replace-on') : localize('levels', 'rewards-replace-off')
                    })
                });
            }

            if (rewards.length === 0) {
                return interaction.reply({ephemeral: true, content: localize('levels', 'rewards-list-empty')});
            }
            const lines = rewards
                .slice()
                .sort((a, b) => parseInt(a.level) - parseInt(b.level))
                .map(r => localize('levels', 'rewards-list-line', {
                    l: r.level,
                    roles: formatRoles(r.roles || []),
                    replace: r.replacePrevious ? localize('levels', 'rewards-replace-on') : localize('levels', 'rewards-replace-off')
                }));
            return interaction.reply({ephemeral: true, content: lines.join('\n')});
        }
    },
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
            if (!user) return interaction.editReply('⚠️ ' + localize('levels', 'user-not-found'));
            interaction.client.logger.info(localize('levels', 'user-deleted-users-xp', {
                t: formatDiscordUserName(interaction.user),
                u: user.userID
            }));
            if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'user-deleted-users-xp', {
                t: formatDiscordUserName(interaction.user),
                u: user.userID
            }));
            await user.destroy();
            await interaction.editReply(localize('levels', 'removed-xp-successfully', {u: user.userID}));
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
    defaultMemberPermissions: ['MODERATE_MEMBERS'],
    description: localize('levels', 'edit-xp-command-description'),

    options: function (client) {
        const array = [];
        if (rewardsCommandsEnabled(client)) {
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'rewards',
                description: localize('levels', 'rewards-command-description'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'add',
                        description: localize('levels', 'rewards-add-description'),
                        options: [
                            {
                                type: 'INTEGER',
                                required: true,
                                name: 'level',
                                description: localize('levels', 'rewards-level-description')
                            },
                            {
                                type: 'ROLE',
                                required: true,
                                name: 'role',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role2',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role3',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role4',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role5',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'BOOLEAN',
                                required: false,
                                name: 'replaceprevious',
                                description: localize('levels', 'rewards-replace-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'set',
                        description: localize('levels', 'rewards-set-description'),
                        options: [
                            {
                                type: 'INTEGER',
                                required: true,
                                name: 'level',
                                description: localize('levels', 'rewards-level-description')
                            },
                            {
                                type: 'ROLE',
                                required: true,
                                name: 'role',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role2',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role3',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role4',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'ROLE',
                                required: false,
                                name: 'role5',
                                description: localize('levels', 'rewards-role-description')
                            },
                            {
                                type: 'BOOLEAN',
                                required: false,
                                name: 'replaceprevious',
                                description: localize('levels', 'rewards-replace-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'remove',
                        description: localize('levels', 'rewards-remove-description'),
                        options: [
                            {
                                type: 'INTEGER',
                                required: true,
                                name: 'level',
                                description: localize('levels', 'rewards-level-description')
                            },
                            {
                                type: 'ROLE',
                                required: true,
                                name: 'role',
                                description: localize('levels', 'rewards-role-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'clear',
                        description: localize('levels', 'rewards-clear-description'),
                        options: [
                            {
                                type: 'INTEGER',
                                required: true,
                                name: 'level',
                                description: localize('levels', 'rewards-level-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'list',
                        description: localize('levels', 'rewards-list-description'),
                        options: [
                            {
                                type: 'INTEGER',
                                required: false,
                                name: 'level',
                                description: localize('levels', 'rewards-level-description')
                            }
                        ]
                    }
                ]
            });
        }
        array.push({
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
        });
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
