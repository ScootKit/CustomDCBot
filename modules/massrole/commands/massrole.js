const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
let target;
let failed;

module.exports.beforeSubcommand = async function (interaction) {
    if (interaction.member.roles.cache.filter(m => interaction.client.configurations['massrole']['config'].adminRoles.includes(m.id)).size === 0) {
        return interaction.reply({ephemeral: true, content: localize('massrole', 'not-admin')});
    }
};

module.exports.subcommands = {
    'add': async function (interaction) {
        if (interaction.replied) return;
        const moduleStrings = interaction.client.configurations['massrole']['strings'];
        checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ephemeral: true});
            for (const member of interaction.guild.members.cache.values()) {
                try {
                    await member.roles.add(interaction.options.getRole('role'), localize('massrole', 'add-reason', {u: interaction.user.tag}));
                } catch (e) {
                    failed++;
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }
        } else if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            for (const member of interaction.guild.members.cache.values()) {
                if (member.user.bot) {
                    try {
                        await member.roles.add(interaction.options.getRole('role'), localize('massrole', 'add-reason', {u: interaction.user.tag}));
                    } catch (e) {
                        failed++;
                    }
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }
        } else if (target === 'humans') {
            await interaction.deferReply({ephemeral: true});
            for (const member of interaction.guild.members.cache.values()) {
                if (member.manageable) {
                    if (!member.user.bot) {
                        try {

                            await member.roles.add(interaction.options.getRole('role'), localize('massrole', 'add-reason', {u: interaction.user.tag}));
                        } catch (e) {
                            failed++;
                        }
                    }
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }
        }
    },
    'remove': async function (interaction) {
        if (interaction.replied) return;
        const moduleStrings = interaction.client.configurations['massrole']['strings'];
        checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
            for (const member of interaction.guild.members.cache.values()) {
                try {
                    await member.roles.remove(interaction.options.getRole('role'), localize('massrole', 'remove-reason', {u: interaction.user.tag}));
                } catch (e) {
                    failed++;
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }

        }
        if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            for (const member of interaction.guild.members.cache.values()) {
                if (member.user.bot) {
                    try {
                        await member.roles.remove(interaction.options.getRole('role'), localize('massrole', 'remove-reason', {u: interaction.user.tag}));
                    } catch (e) {
                        failed++;
                    }
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }

        }
        if (target === 'humans') {
            await interaction.deferReply({ ephemeral: true });
            for (const member of interaction.guild.members.cache.values()) {
                if (member.manageable) {
                    if (!member.user.bot) {
                        try {
                            await member.roles.remove(interaction.options.getRole('role'), localize('massrole', 'remove-reason', {u: interaction.user.tag}));
                        } catch (e) {
                            failed++;
                        }
                    }
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }

        }
    },
    'remove-all': async function (interaction) {
        if (interaction.replied) return;
        const moduleStrings = interaction.client.configurations['massrole']['strings'];
        checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
            for (const member of interaction.guild.members.cache.values()) {
                try {
                    await member.roles.remove(member.roles.cache.filter(role => !role.managed), localize('massrole', 'remove-reason', {u: interaction.user.tag}));
                } catch (e) {
                    failed++;
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }
        } else if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            for (const member of interaction.guild.members.cache.values()) {
                if (member.manageable) {
                    if (member.user.bot) {
                        try {
                            await member.roles.remove(member.roles.cache.filter(role => !role.managed), localize('massrole', 'remove-reason', {u: interaction.user.tag}));
                        } catch (e) {
                            failed++;
                        }
                    }
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }
        } else if (target === 'humans') {
            await interaction.deferReply({ ephemeral: true });
            for (const member of interaction.guild.members.cache.values()) {
                if (member.manageable) {
                    if (!member.user.bot) {
                        try {
                            await member.roles.remove(member.roles.cache.filter(role => !role.managed), localize('massrole', 'remove-reason', {u: interaction.user.tag}));
                        } catch (e) {
                            failed++;
                        }
                    }
                }
            }
            if (failed === 0) {
                await interaction.editReply(embedType(moduleStrings.done, {}));
            } else {
                await interaction.editReply(embedType(moduleStrings.notDone, {}));
                failed = 0;
            }
        }
    }
};

/**
 * Read content of "target"-option
 *
 */
function checkTarget(interaction) {
    if (!interaction.options.getString('target') || interaction.options.getString('target') === 'all') {
        target = 'all';
    } else if (interaction.options.getString('target') === 'bots') {
        target = 'bots';
    } else if (interaction.options.getString('target') === 'humans') {
        target = 'humans';
    }
}


module.exports.config = {
    name: 'massrole',
    defaultMemberPermissions: ['ADMINISTRATOR'],
    description: localize('massrole', 'command-description'),

    options: [
        {
            type: 'SUB_COMMAND',
            name: 'add',
            description: localize('massrole', 'add-subcommand-description'),
            options: [
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: localize('massrole', 'role-option-add-description')
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    choices: [
                        {
                            name: localize('massrole', 'all-users'),
                            value: 'all'
                        },
                        {
                            name: localize('massrole', 'bots'),
                            value: 'bots'
                        },
                        {
                            name: localize('massrole', 'humans'),
                            value: 'humans'
                        }
                    ],
                    description: localize('massrole', 'target-option-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove',
            description: localize('massrole', 'remove-subcommand-description'),
            options: [
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: localize('massrole', 'role-option-remove-description')
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    choices: [
                        {
                            name: localize('massrole', 'all-users'),
                            value: 'all'
                        },
                        {
                            name: localize('massrole', 'bots'),
                            value: 'bots'
                        },
                        {
                            name: localize('massrole', 'humans'),
                            value: 'humans'
                        }
                    ],
                    description: localize('massrole', 'target-option-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove-all',
            description: localize('massrole', 'remove-all-subcommand-description'),
            options: [
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    choices: [
                        {
                            name: localize('massrole', 'all-users'),
                            value: 'all'
                        },
                        {
                            name: localize('massrole', 'bots'),
                            value: 'bots'
                        },
                        {
                            name: localize('massrole', 'humans'),
                            value: 'humans'
                        }
                    ],
                    description: localize('massrole', 'target-option-description')
                }
            ]
        }
    ]
};