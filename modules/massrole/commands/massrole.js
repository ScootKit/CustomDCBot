//TODO: Autocomplete
const {arrayToApplicationCommandPermissions} = require("../../../src/functions/helpers");
module.exports.subcommands = {
    'add': async function (interaction) {
        //TODO: targets 'bots' and 'humans'; clean up
        if (!interaction.options.getString('target') || interaction.options.getString('target') === 'all') {
            await interaction.deferReply({ ephemeral: true });
                interaction.guild.members.cache.forEach(member => {
                    if (member.manageable){
                        member.roles.add(interaction.options.getRole('role'));
                    }
                });
            await interaction.editReply('Done!'); //TODO: Use strings.json
        }
    },
    'remove': async function (interaction) {
        //TODO: targets 'bots' and 'humans'; clean up
        if (!interaction.options.getString('target') || interaction.options.getString('target') === 'all') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                if (member.manageable){
                    member.roles.remove(interaction.options.getRole('role'));
                }
            });
            await interaction.editReply('Done!'); //TODO: Use strings.json
        }
    },
    'remove-all': async function (interaction) {
        //TODO: targets 'bots' and 'humans'; clean up
        if (!interaction.options.getString('target') || interaction.options.getString('target') === 'all') {
            await interaction.deferReply({ ephemeral: true });
            interaction.guild.members.cache.forEach(member => {
                if (member.manageable){
                    member.roles.remove(member.roles.cache.filter(role => !role.managed));
                }
            });
            await interaction.editReply('Done!'); //TODO: Use strings.json
        }
    }
};

module.exports.config = {
    name: 'massrole',
    description: 'manages roles for all members',
    defaultPermission: false,
    permissions: async function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['massrole']['config']['allowed_member_ids'], 'ROLE');
    },
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
