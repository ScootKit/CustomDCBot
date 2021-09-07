const {arrayToApplicationCommandPermissions} = require('../../../src/functions/helpers');

module.exports.subcommands = {
    'movechannel': async function (interaction) {
        const channel = interaction.options.getChannel('channel', true);
        if (!interaction.options.get('new-position')) return interaction.reply({
            content: `${channel.toString()} has the position ${channel.position}`,
            ephemeral: true
        });
        await channel.setPosition(interaction.options.getInteger('new-position'));
        await interaction.reply({
            content: `Changed ${channel.toString()}'s position to ${channel.position}.`,
            ephemeral: true
        });
    },
    'moverole': async function (interaction) {
        const role = interaction.options.getRole('role', true);
        if (!interaction.options.get('new-position')) return interaction.reply({
            content: `${role.toString()} has the position ${role.position}`,
            ephemeral: true
        });
        await role.setPosition(interaction.options.getInteger('new-position'));
        await interaction.reply({
            content: `Changed ${role.toString()}'s position to ${role.position}.`,
            ephemeral: true
        });
    },
    'setcategory': async function (interaction) {
        const channel = interaction.options.getChannel('channel', true);
        if (channel.type === 'GUILD_CATEGORY') return interaction.reply({
            content: '⚠ A Category can not have a category',
            ephemeral: true
        });
        const category = interaction.options.getChannel('category', true);
        if (category.type !== 'GUILD_CATEGORY') return interaction.reply({
            content: '⚠ Can not change category of channel to a not category channel',
            ephemeral: true
        });
        await channel.setParent(category);
        interaction.reply({
            ephemeral: true,
            content: `${channel.toString()}'s category got set to ${category.toString()}.`
        });
    }
};

module.exports.config = {
    name: 'admin',
    description: 'Execute some actions for admins via commands',
    defaultPermission: false,
    permissions: async function (client) {
        return arrayToApplicationCommandPermissions(client.configurations['admin-tools']['config']['admin_allowed_member_ids'], 'ROLE');
    },
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'movechannel',
            description: 'See the position of a channel or change the position of a channel',
            options: [
                {
                    type: 'CHANNEL',
                    required: true,
                    name: 'channel',
                    description: 'Channel on which this action should be executed'
                },
                {
                    type: 'INTEGER',
                    required: false,
                    name: 'new-position',
                    description: 'New position of the channel'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'moverole',
            description: 'See the position of a role or change the position of it',
            options: [
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: 'Role on which this action should be executed'
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'new-position',
                    description: 'New position of the role'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'setcategory',
            description: 'Sets the category of a channel',
            options: [
                {
                    type: 'CHANNEL',
                    required: true,
                    name: 'channel',
                    description: 'Role on which this action should be executed'
                },
                {
                    type: 'CHANNEL',
                    required: false,
                    name: 'category',
                    description: 'New category of the channel'
                }
            ]
        }
    ]
};