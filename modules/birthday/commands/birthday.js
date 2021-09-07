const {generateBirthdayEmbed} = require('../birthday');
const {getUser} = require('@scnetwork/api');
const {AgeFromDateString} = require('age-calculator');
const {embedType} = require('../../../src/functions/helpers');

module.exports.beforeSubcommand = async function (interaction) {
    interaction.birthday = await interaction.client.models['birthday']['User'].findOne({
        where: {
            id: interaction.user.id
        }
    });
};

module.exports.subcommands = {
    'status': async function (interaction) {
        if (!interaction.birthday) return interaction.reply({
            ephemeral: true,
            content: '⚠️ You don\'t currently have a registered birthday on this server. If you have autoSync enabled, it could take up to 24 hours to be synchronized on every server. [Learn more about birthday synchronization](<https://docs.sc-network.net/de/dashboard/birthday-sync-faq>).'
        });
        interaction.reply({
            ephemeral: true,
            content: `Your birthday is currently set to **${interaction.birthday.day}.${interaction.birthday.month + (interaction.birthday.year ? `.${interaction.birthday.year}` : '')}**${interaction.birthday.year ? `which means you are **${new AgeFromDateString(`${interaction.birthday.year}-${interaction.birthday.month - 1}-${interaction.birthday.day}`).age} years old**` : ''}.\n${interaction.birthday.sync ? 'Your birthday is being synced via your [SC Network Account](https://sc-network.net/dashboard).' : 'Your birthday is set locally on this server and will not be synchronized.'}`
        });
    },
    'sync': async function (interaction) {
        const scnUser = await getUser(interaction.user.id).catch(() => {
        });
        if (!scnUser || typeof scnUser !== 'object' || typeof scnUser.birthday !== 'object' || !(scnUser.birthday || {}).day) return interaction.reply({
            ephemeral: true,
            content: `⚠ It seems like you either don't have an [SC Network Account](<https://sc-network.net/dashboard>) or you haven't entered any information about your birthday in it yet.`
        });
        if (scnUser.birthday.autoSync) return interaction.reply({
            ephemeral: true,
            content: `⚠ It seems that you have autoSync in your [SC Network Account](<https://sc-network.net/dashboard>) enabled. This means that your birthday will be synchronized all the time on every server. [Learn more](<https://docs.sc-network.net/de/dashboard/birthday-sync-faq#ich-kann-meinen-geburtstag-nicht-mehr-manuell-auf-einem-server-setzen>).\nYour birthday isn't showing up? It can take up to 24 hours (usually it's less than two hours) for it to be synced, so stay calm and wait just a bit longer.`
        });
        const action = interaction.options.getString('action');
        if (action === 'enable') {
            if (!interaction.birthday) {
                interaction.birthday = await interaction.client.models.birthday['User'].create({
                    id: interaction.user.id
                });
            }

            interaction.birthday.sync = true;
            interaction.birthday.day = scnUser.birthday.day;
            interaction.birthday.month = scnUser.birthday.month;
            interaction.birthday.year = scnUser.birthday.year;
            interaction.birthday.verified = scnUser.birthday.verified;

            await interaction.reply({
                ephemeral: true,
                content: 'Successfully set. The synchronization is now enabled :+1:'
            });
            interaction.regenerateEmbed = true;
        } else {
            if (!interaction.birthday) return interaction.reply({
                ephemeral: true,
                content: '⚠️ You don\'t currently have a registered birthday on this server. If you have autoSync enabled, it could take up to 24 hours to be synchronized on every server. [Learn more about birthday synchronization](<https://docs.sc-network.net/de/dashboard/birthday-sync-faq>).'
            });
            interaction.birthday.sync = false;
            interaction.birthday.verified = false;
            await interaction.reply({
                ephemeral: true,
                content: 'Successfully set. The synchronization is disabled, you can now change or remove your birthday from this server.'
            });
            interaction.regenerateEmbed = true;
        }
    },
    'delete': async function (interaction) {
        if (!interaction.birthday) return interaction.reply({
            ephemeral: true,
            content: '⚠️ You don\'t currently have a registered birthday on this server. If you have autoSync enabled, it could take up to 24 hours to be synchronized on every server. [Learn more about birthday synchronization](<https://docs.sc-network.net/de/dashboard/birthday-sync-faq>).'
        });
        if (interaction.birthday.sync) return interaction.reply({
            ephemeral: true,
            content: '⚠ You currently have sync enabled. Please disable sync to delete your birthday.'
        });
        await interaction.birthday.destroy();
        interaction.birthday = null;
        interaction.reply({
            ephemeral: true,
            content: '🗑️ Birthday deleted successfully.'
        });
        interaction.regenerateEmbed = true;
    },
    'set': async function (interaction) {
        const day = interaction.options.getInteger('day', true);
        const month = interaction.options.getInteger('month', true);
        const year = interaction.options.getInteger('year');

        if (interaction.client.configurations['birthday']['config'].forceSCNetworkSync) {
            return interaction.reply({
                ephemeral: true,
                content: '⚠ This server only allows synchronization of your birthday with a [SC Network Account](<https://sc-network.net/dashboard>).'
            });
        }

        if ((day > 31 || day < 1) || (month > 12 || month < 1)) return interaction.reply({
            ephemeral: true,
            content: '⚠ Invalid date provided'
        });

        if (year) {
            const age = new AgeFromDateString(`${year}-${month - 1}-${day}`).age;
            if (age < 13) return interaction.reply({
                ephemeral: true,
                content: `⚠ You have to be at least 13 years old to use Discord. Please read Discord's [Terms of Service](<https://discord.com/tos>) and if you are under the age of 13 please [delete your account](<https://support.discord.com/hc/en-us/articles/212500837-How-do-I-permanently-delete-my-account->) to comply with Discord's [Terms of Service](<https://discord.com/tos>) and wait ${13 - age} (or for the age for your country, listed [here](<https://support.discord.com/hc/en-us/articles/360040724612-Why-is-Discord-asking-for-my-birthday->)) years before creating a new account.`
            });
            if (age > 125) return interaction.reply({
                ephemeral: true,
                content: `⚠ It seems like you are too old to be alive.`
            });
        }

        if (!interaction.birthday) {
            interaction.birthday = await interaction.client.models.birthday['User'].create({
                id: interaction.user.id
            });
        }

        interaction.birthday.day = day;
        interaction.birthday.month = month;
        interaction.birthday.year = year;
        interaction.regenerateEmbed = true;

        await interaction.reply(embedType(interaction.client.configurations['birthday']['config']['successfully_changed'], {}, {ephemeral: true}));
    }
};

module.exports.run = async function (interaction) {
    if (interaction.birthday) await interaction.birthday.save();
    if (interaction.regenerateEmbed) await generateBirthdayEmbed(interaction.client);
};

module.exports.config = {
    name: 'birthday',
    description: 'Change, edit and see your birthday',
    defaultPermission: true,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'status',
            description: 'Shows the current status of your birthday'
        },
        {
            type: 'SUB_COMMAND',
            name: 'sync',
            description: 'Manage the synchronization on this server',
            options: [
                {
                    type: 'STRING',
                    name: 'action',
                    description: 'Action which should be performed on your synchronization',
                    required: true,
                    choices: [
                        {
                            name: 'enable',
                            description: 'Enable synchronization',
                            value: 'enable'
                        },
                        {
                            name: 'disable',
                            description: 'Disables synchronization',
                            value: 'disable'
                        }
                    ]
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'set',
            description: 'Sets your birthday',
            options: [
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'day',
                    description: 'Day of your birthday'
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'month',
                    description: 'Month of your birthday'
                },
                {
                    type: 'INTEGER',
                    required: false,
                    name: 'year',
                    description: 'Year of your birthday'
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'delete',
            description: 'Deletes your birthday from this server'
        }
    ]
};