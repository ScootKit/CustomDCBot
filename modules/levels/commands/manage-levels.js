const {arrayToApplicationCommandPermissions} = require('../../../src/functions/helpers');
const {registerNeededEdit} = require('../leaderboardChannel');
const frontedUsers = []; // Easteregg , just ignore it

module.exports.subcommands = {
    'reset-xp': async function (interaction) {
        const type = interaction.options.getUser('user') ? 'user' : 'server';
        if (!interaction.options.getBoolean('confirm')) return interaction.reply({
            ephemeral: 'true',
            content: type === 'user' ? `Okay, do you really want to screw with ${interaction.options.getUser('user').toString()}? If you hate them so much, feel free to run \`/manage-levels reset-xp confirm:True user:${interaction.options.getUser('user').tag}\` to run this irreversible action.` : 'Do you really want to delete all XP and Levels from this server? This action is irreversible and everyone on this server will hate you. Decided that it\'s worth it? Enter `/manage-levels reset-xp confirm:True` (as a slash command obviously)'
        });
        await interaction.deferReply();
        if (type === 'user') {
            const user = await interaction.client.models['levels']['User'].findOne({
                where: {
                    userID: interaction.options.getUser('user').id
                }
            });
            if (!user) return interaction.editReply(':warning: User not found.');
            interaction.client.logger.info(`${interaction.user.tag} deleted the XP of the user with id ${user.userID}`);
            if (interaction.client.logChannel) await interaction.client.logChannel.send(`${interaction.user.tag} deleted the XP of the user with id ${user.userID}`);
            await user.destroy();
            await interaction.editReply(`Removed ${interaction.options.getUser('user').toString()}'s XP and level successfully.`);
        } else {
            const users = await interaction.client.models['levels']['User'].findAll();
            for (const user of users) await user.destroy();
            interaction.client.logger.info(`${interaction.user.tag} deleted the XP of all users`);
            if (interaction.client.logChannel) await interaction.client.logChannel.send(`${interaction.user.tag} deleted the XP of all users`);
            await interaction.editReply('Successfully deleted all the XP of all users');
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
            content: ':warning: This user doesn\'t have a profile (yet), please force them to write a message before trying to betrayal your community by manipulating level scores.'
        });
        if (dcUser.id === interaction.user.id) {
            interaction.client.logger.info(`${interaction.user.tag} wanted to use their privileges to their own benefit by manipulating their own XP. This is obviously abuse, I expect disciplinary measures to be taken against this user.`);
            if (interaction.client.logChannel) await interaction.client.logChannel.send(`${interaction.user.tag} wanted to use their privileges to their own benefit by manipulating their own XP. This is obviously abuse, I expect disciplinary measures to be taken against this user.`);
            interaction.reply({
                ephemeral: true,
                content: frontedUsers.includes(interaction.user.id) ? 'And you are trying again... This is very very sad, I am going to report you another time and want to stretch again that this is obviously abuse of your privileges. Have a nice day.' : `Wait... you are joking right? You aren't, right? You are serious... I am very disappointed of you, ${interaction.user.username}... I though you were a honest and fair admin, but as I can see today, you aren't. You wanted to use this command for your own benefit and betray all users on your server. I am honestly very very disappointed of you, I was expecting more from you. I will have to report this incidence to your supervisor and - as I said - I am very disappointed and frankly - if I had had the permission to - would have banned you from this server, because this incident proves that you wanted to abuse your privileges for your own benefit. `
            });
            if (!frontedUsers.includes(interaction.user.id)) frontedUsers.push(interaction.user.id);
            return;
        }
        user.xp = interaction.options.getNumber('value');
        await user.save();
        interaction.client.logger.info(`${interaction.user.tag} manipulated the XP of ${user.userID} to ${interaction.options.getNumber('value')}.`);
        if (interaction.client.logChannel) await interaction.client.logChannel.send(`${interaction.user.tag} manipulated the XP of ${user.userID} to ${interaction.options.getNumber('value')}.`);
        await interaction.reply({
            ephemeral: true,
            content: 'Successfully edited the XP of this user. Remember, every change you make destroys the experience of other users on this server as the levelsystem isn\'t fair anymore.'
        });
    }
};

module.exports.run = function () {
    registerNeededEdit();
};

module.exports.config = {
    name: 'manage-levels',
    description: 'Manage the levels of your server',
    defaultPermission: false,
    permissions: function (client) {
        return arrayToApplicationCommandPermissions(Array.from(client.guild.roles.cache.filter(r => r.permissions.has('ADMINISTRATOR')).keys()), 'ROLE');
    },
    options: function (client) {
        const array = [{
            type: 'SUB_COMMAND',
            name: 'reset-xp',
            description: 'Reset the XP of a user or of the whole server',
            options: [
                {
                    type: 'USER',
                    required: false,
                    name: 'user',
                    description: 'User to reset the XP from (default: whole server)'
                },
                {
                    type: 'BOOLEAN',
                    required: false,
                    name: 'confirm',
                    description: 'Do you really want to delete the data?'
                }
            ]
        }];
        if (client.configurations['levels']['config']['allowCheats']) array.push({
            type: 'SUB_COMMAND',
            name: 'edit-xp',
            description: 'Betrays your community and edits a user\'s XP',
            options: [
                {
                    type: 'USER',
                    required: true,
                    name: 'user',
                    description: 'User to be edited (can *not* be you!)'
                },
                {
                    type: 'NUMBER',
                    required: true,
                    name: 'value',
                    description: 'New XP value of the user'
                }
            ]
        });
        return array;
    }
};