const {localize} = require('../../../src/functions/localize');

module.exports.subcommands = {
    'movechannel': async function (interaction) {
        const channel = interaction.options.getChannel('channel', true);
        if (!interaction.options.get('new-position')) return interaction.reply({
            content: localize('admin-tools', 'position', {i: channel.toString(), p: channel.position}),
            ephemeral: true
        });
        await channel.setPosition(interaction.options.getInteger('new-position'));
        await interaction.reply({
            content: localize('admin-tools', 'position-changed', {i: channel.toString(), p: channel.position}),
            ephemeral: true
        });
    },
    'moverole': async function (interaction) {
        const role = interaction.options.getRole('role', true);
        if (!interaction.options.get('new-position')) return interaction.reply({
            content: localize('admin-tools', 'position', {i: role.toString(), p: role.position}),
            ephemeral: true
        });
        await role.setPosition(interaction.options.getInteger('new-position'));
        await interaction.reply({
            content: localize('admin-tools', 'position-changed', {i: role.toString(), p: role.position}),
            ephemeral: true
        });
    },
    'setcategory': async function (interaction) {
        const channel = interaction.options.getChannel('channel', true);
        if (channel.type === 'GUILD_CATEGORY') return interaction.reply({
            content: '⚠ ' + localize('admin-tools', 'category-can-not-have-category'),
            ephemeral: true
        });
        const category = interaction.options.getChannel('category', true);
        if (category.type !== 'GUILD_CATEGORY') return interaction.reply({
            content: '⚠ ' + localize('admin-tools', 'not-category'),
            ephemeral: true
        });
        await channel.setParent(category);
        interaction.reply({
            ephemeral: true,
            content: localize('admin-tools', 'changed-category', {cat: category.toString(), c: channel.toString()})
        });
    }
};

module.exports.config = {
    name: 'admin',
    description: localize('admin-tools', 'command-description'),
    defaultPermission: false,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'movechannel',
            description: localize('admin-tools', 'movechannel-description'),
            options: [
                {
                    type: 'CHANNEL',
                    required: true,
                    name: 'channel',
                    description: localize('admin-tools', 'channel-description')
                },
                {
                    type: 'INTEGER',
                    required: false,
                    name: 'new-position',
                    description: localize('admin-tools', 'new-position-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'moverole',
            description: localize('admin-tools', 'moverole-description'),
            options: [
                {
                    type: 'ROLE',
                    required: true,
                    name: 'role',
                    description: localize('admin-tools', 'role-description')
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'new-position',
                    description: localize('admin-tools', 'new-position-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'setcategory',
            description: localize('admin-tools', 'setcategory-description'),
            options: [
                {
                    type: 'CHANNEL',
                    required: true,
                    name: 'channel',
                    channelTypes: ['GUILD_TEXT', 'GUILD_VOICE', 'GUILD_NEWS', 'GUILD_STAGE_VOICE'],
                    description: localize('admin-tools', 'channel-description')
                },
                {
                    type: 'CHANNEL',
                    required: false,
                    name: 'category',
                    description: localize('admin-tools', 'category-description')
                }
            ]
        }
    ]
};