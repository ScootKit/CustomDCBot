const {registerNeededEdit} = require('../leaderboardChannel');
const {localize} = require('../../../src/functions/localize');
const frontedUsers = []; // Easteregg, just ignore it

module.exports.subcommands = {
    'reset-xp': async function (interaction) {
        const type = interaction.options.getUser('user') ? 'user' : 'server';
        if (!interaction.options.getBoolean('confirm')) return interaction.reply({
            ephemeral: 'true',
            content: type === 'user' ? localize('levels', 'are-you-sure-you-want-to-delete-user-xp', {u: interaction.options.getUser('user').toString(), ut: interaction.options.getUser('user').tag})
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
            interaction.client.logger.info(localize('levels', 'user-deleted-users-xp', {t: interaction.user.tag, u: user.userID}));
            if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'user-deleted-users-xp', {t: interaction.user.tag, u: user.userID}));
            await user.destroy();
            await interaction.editReply(localize('levels', 'removed-xp-successfully'));
        } else {
            const users = await interaction.client.models['levels']['User'].findAll();
            for (const user of users) await user.destroy();
            interaction.client.logger.info(localize('levels', 'deleted-server-xp', {u: interaction.user.tag}));
            if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'deleted-server-xp', {u: interaction.user.tag}));
            await interaction.editReply(localize('levels', 'successfully-deleted-all-xp-of-users'));
        }
    },
    'edit-xp': async function (interaction) {
        const dcUser = interaction.options.getUser('user');
        const user = await interaction.client.models['levels']['User'].findOne({
            where: {
                userID: dcUser.id
            }
        });
        if (!user) return interaction.reply({
            ephemeral: true,
            content: ':warning: ' + localize('levels', 'cheat-no-profile')
        });
        if (dcUser.id === interaction.user.id) {
            interaction.client.logger.info(localize('levels', 'abuse-detected', {u: interaction.user.tag}));
            if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'abuse-detected', {u: interaction.user.tag}));
            interaction.reply({
                ephemeral: true,
                content: frontedUsers.includes(interaction.user.id) ? localize('levels', 'cant-change-your-level-2', {un: interaction.user.username}) : localize('levels', 'cant-change-your-level-1', {un: interaction.user.username})
            });
            if (!frontedUsers.includes(interaction.user.id)) frontedUsers.push(interaction.user.id);
            return;
        }
        user.xp = interaction.options.getNumber('value');
        await user.save();
        interaction.client.logger.info(localize('levels', 'manipulated', {
            u: interaction.user.tag,
            m: dcUser.tag,
            v: interaction.options.getNumber('value')
        }));
        if (interaction.client.logChannel) await interaction.client.logChannel.send(localize('levels', 'manipulated', {
            u: interaction.user.tag,
            m: dcUser.tag,
            v: interaction.options.getNumber('value')
        }));
        await interaction.reply({
            ephemeral: true,
            content: localize('levels', 'successfully-changed')
        });
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
        if (client.configurations['levels']['config']['allowCheats']) array.push({
            type: 'SUB_COMMAND',
            name: 'edit-xp',
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
        });
        return array;
    }
};