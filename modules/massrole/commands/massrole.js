//TODO: Autocomplete
let target;
module.exports.subcommands = {
    'add': async function (interaction) {
        await checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
                interaction.guild.members.cache.forEach(member => {
                        member.roles.add(interaction.options.getRole('role'));
                });
            await interaction.editReply('Done!'); //TODO: Use strings.json
        }
        else if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    if (member.user.bot) {
                    member.roles.add(interaction.options.getRole('role'));
                }
            });
            await interaction.editReply('Done!'); //TODO: Use strings.json
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
            await interaction.editReply('Done!'); //TODO: Use strings.json
        }
    },
    'remove': async function (interaction) {
        await checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    member.roles.remove(interaction.options.getRole('role'));
            });
            await interaction.editReply('Done!'); //TODO: Use strings.json
        }
        if (target === 'bots') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    if (member.user.bot) {
                        member.roles.remove(interaction.options.getRole('role'));
                }
            });
            await interaction.editReply('Done!'); //TODO: Use strings.json
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
            await interaction.editReply('Done!'); //TODO: Use strings.json
        }
    },
    'remove-all': async function (interaction) {
        await checkTarget(interaction);
        if (target === 'all') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                    member.roles.remove(member.roles.cache.filter(role => !role.managed));
            });
            await interaction.editReply('Done!'); //TODO: Use strings.json
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
            await interaction.editReply('Done!'); //TODO: Use strings.json
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
            await interaction.editReply('Done!'); //TODO: Use strings.json
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

module.exports.config = {
    name: 'massrole',
    description: 'manages roles for all members',
    defaultPermission: false,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'add',
            description: 'Add a role to all members',
            options: [
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: 'The role, that will be given to all users'
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    description: 'Determines whether bots should be included or not'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove',
            description: 'Remove a role from all members',
            options: [
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: 'The role, that will be removed from all users'
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    description: 'Determines whether bots should be included or not'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove-all',
            description: 'Remove all roles from all members',
            options: [
                {
                    type: 'STRING',
                    required: false,
                    name: 'target',
                    description: 'Determines whether bots should be included or not'
                }
            ]
        }
    ]
};
