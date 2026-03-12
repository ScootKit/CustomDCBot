const { ChannelType } = require('discord.js');
const { localize } = require('../../../src/functions/localize');

module.exports.subcommands = {
    'movechannel': async function (interaction) {
        const channel = interaction.options.getChannel('channel', true);
        const newPos = interaction.options.getInteger('new-position');
        const reason = interaction.options.getString('reason') ?? `Moved by ${interaction.user.tag}`;

        if (newPos === null) return interaction.reply({
            content: localize('admin-tools', 'position', { i: channel.toString(), p: channel.position }),
            ephemeral: true
        });

        await channel.setPosition(newPos, { reason });
        await interaction.reply({
            content: localize('admin-tools', 'position-changed', { i: channel.toString(), p: newPos }),
            ephemeral: true
        });
    },

    'moverole': async function (interaction) {
        const role = interaction.options.getRole('role', true);
        const newPos = interaction.options.getInteger('new-position', true);
        const reason = interaction.options.getString('reason') ?? `Moved by ${interaction.user.tag}`;

        await role.setPosition(newPos, { reason });
        await interaction.reply({
            content: localize('admin-tools', 'position-changed', { i: role.toString(), p: newPos }),
            ephemeral: true
        });
    },

    'setcategory': async function (interaction) {
        const channel = interaction.options.getChannel('channel', true);
        const category = interaction.options.getChannel('category', true);
        const sync = interaction.options.getBoolean('sync') ?? true; // Default to true
        const reason = interaction.options.getString('reason') ?? `Category change by ${interaction.user.tag}`;

        if (channel.type === ChannelType.GuildCategory) return interaction.reply({
            content: '⚠️ ' + localize('admin-tools', 'category-can-not-have-category'),
            ephemeral: true
        });

        // lockPermissions: true will sync permissions with the new category
        await channel.setParent(category, { lockPermissions: sync, reason });

        await interaction.reply({
            ephemeral: true,
            content: localize('admin-tools', 'changed-category', { cat: category.toString(), c: channel.toString() }) + 
                     ` (Permissions: ${sync ? 'Synced' : 'Original'})`
        });
    }
};
