const {localize} = require("../../../src/functions/localize");
let target;

module.exports.subcommands = {
    'add': async function (interaction) {
        await checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
                interaction.guild.members.cache.forEach(member => {
                        member.roles.add(interaction.options.getRole('role'));
                });
            await interaction.editReply(localize('massrole', 'done'));
        }
        else if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    if (member.user.bot) {
                    member.roles.add(interaction.options.getRole('role'));
                }
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
        else if (target === 'humans') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                if (member.manageable) {
                    if (!member.user.bot) {
                        member.roles.add(interaction.options.getRole('role'));
                    }
                }
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
    },
    'remove': async function (interaction) {
        await checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    member.roles.remove(interaction.options.getRole('role'));
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
        if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    if (member.user.bot) {
                        member.roles.remove(interaction.options.getRole('role'));
                }
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
        if (target === 'humans') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                if (member.manageable) {
                    if (!member.user.bot) {
                        member.roles.remove(interaction.options.getRole('role'));
                    }
                }
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
    },
    'remove-all': async function (interaction) {
        await checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    member.roles.remove(member.roles.cache.filter(role => !role.managed));
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
        else if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                if (member.manageable) {
                    if (member.user.bot) {
                        member.roles.remove(member.roles.cache.filter(role => !role.managed));
                    }
                }
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
        else if (target === 'humans') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                if (member.manageable) {
                    if (!member.user.bot) {
                        member.roles.remove(member.roles.cache.filter(role => !role.managed));
                    }
                }
            });
            await interaction.editReply(localize('massrole', 'done'));
        }
    }
};

function checkTarget(interaction) {
    if (!interaction.options.getString('target') || interaction.options.getString('target') === 'all') {
        target = 'all';
    }
    else if (interaction.options.getString('target') === 'bots') {
        target = 'bots';
    }
    else if (interaction.options.getString('target') === 'humans') {
        target = 'humans';
    }
}
function autoCompleteTarget(interaction) {
    interaction.respond([
        {
            name: 'All Users',
            value: 'all'
        },
        {
            name: 'Bots',
            value: 'bots'
        },
        {
            name: 'Humans',
            value: 'humans'
        },
    ])
}

module.exports.config = {
    name: 'massrole',
    description: localize('massrole', 'command-description'),
    defaultPermission: false,
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
                    description: localize('massrole', 'role-option-add-description'),
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    autocomplete: true,
                    description: localize('massrole', 'target-option-description'),
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
                    description: localize('massrole', 'role-option-remove-description'),
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    autocomplete: true,
                    description: localize('massrole', 'target-option-description'),
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
                    autocomplete: true,
                    description: localize('massrole', 'target-option-description'),
                }
            ]
        }
    ]
};

module.exports.autoComplete = {
    'add': {
        'target': autoCompleteTarget
    },
    'remove': {
        'target': autoCompleteTarget
    },
    'remove-all': {
        'target': autoCompleteTarget
    }
};