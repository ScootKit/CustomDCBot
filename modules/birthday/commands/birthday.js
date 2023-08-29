const {generateBirthdayEmbed} = require('../birthday');
const {getUser} = require('@scnetwork/api');
const {AgeFromDateString, AgeFromDate} = require('age-calculator');
const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

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
            content: '⚠️️️ ' + localize('birthdays', 'no-birthday-set')
        });
        interaction.reply({
            ephemeral: true,
            content: localize('birthdays', 'birthday-status', {
                dd: interaction.birthday.day,
                mm: interaction.birthday.month,
                yyyy: (interaction.birthday.year ? `.${interaction.birthday.year}` : ''),
                age: interaction.birthday.year ? (localize('birthdays', 'your-age', {age: ' ' + new AgeFromDateString(`${interaction.birthday.year}-${interaction.birthday.month - 1}-${interaction.birthday.day}`).age})) : '',
                syncstatus: interaction.client.configurations['birthday']['config'].disableSync ? '' : interaction.birthday.sync ? localize('birthdays', 'sync-on') : localize('birthdays', 'sync-off') // eslint-disable-line no-nested-ternary
            })
        });

    },
    'sync': async function (interaction) {
        const scnUser = await getUser(interaction.user.id).catch(() => {
        });
        if (!scnUser || typeof scnUser !== 'object' || typeof scnUser.birthday !== 'object' || !(scnUser.birthday || {}).day) return interaction.reply({
            ephemeral: true,
            content: '⚠️️ ' + localize('birthdays', 'no-sync-account')
        });
        if (scnUser.birthday.autoSync) return interaction.reply({
            ephemeral: true,
            content: '⚠️️ ' + localize('birthdays', 'auto-sync-on')
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
                content: localize('birthdays', 'enabled-sync')
            });
            interaction.regenerateEmbed = true;
        } else {
            if (!interaction.birthday) return interaction.reply({
                ephemeral: true,
                content: '⚠️️️ ' + localize('birthdays', 'no-birthday-set')
            });
            interaction.birthday.sync = false;
            interaction.birthday.verified = false;
            await interaction.reply({
                ephemeral: true,
                content: localize('birthdays', 'disabled-sync')
            });
            interaction.regenerateEmbed = true;
        }
    },
    'delete': async function (interaction) {
        if (!interaction.birthday) return interaction.reply({
            ephemeral: true,
            content: '⚠️️️ You don\'t currently have a registered birthday on this server. If you have autoSync enabled, it could take up to 24 hours to be synchronized on every server. [Learn more about birthday synchronization](<https://docs.sc-network.net/de/dashboard/birthday-sync-faq>).'
        });
        if (interaction.birthday.sync) return interaction.reply({
            ephemeral: true,
            content: '⚠️️ ' + localize('birthdays', 'delete-but-sync-is-on')
        });
        await interaction.birthday.destroy();
        interaction.birthday = null;
        interaction.reply({
            ephemeral: true,
            content: '🗑️ ' + localize('birthdays', 'deleted-successfully')
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
                content: '⚠️️ ' + localize('birthdays', 'only-sync-allowed')
            });
        }

        if (!interaction.client.configurations['birthday']['config'].disableSync) {
            const u = await getUser(interaction.user.id).catch(() => {
            });
            if (u && (u.birthday || {}).autoSync) return interaction.reply({
                ephemeral: true,
                content: '⚠️️ ' + localize('birthdays', 'auto-sync-on')
            });
        }

        if ((day > 31 || day < 1) || (month > 12 || month < 1)) return interaction.reply({
            ephemeral: true,
            content: '⚠️️ ' + localize('birthdays', 'invalid-date')
        });

        if (year) {
            const age = new AgeFromDate(new Date(year, month - 1, day)).age;
            if (age < 13) return interaction.reply({
                ephemeral: true,
                content: '⚠️️ ' + localize('birthdays', 'against-tos', {waitTime: 13 - age})
            });
            if (age > 125) return interaction.reply({
                ephemeral: true,
                content: '⚠️️ ' + localize('birthdays', 'too-old')
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
        interaction.birthday.sync = false;
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
    description: localize('birthdays', 'command-description'),
    defaultPermission: true,
    options: function (client) {
        const commands = [{
            type: 'SUB_COMMAND',
            name: 'status',
            description: localize('birthdays', 'status-command-description')
        },
        {
            type: 'SUB_COMMAND',
            name: 'set',
            description: localize('birthdays', 'set-command-description'),
            options: [
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'day',
                    description: localize('birthdays', 'set-command-day-description')
                },
                {
                    type: 'INTEGER',
                    required: true,
                    name: 'month',
                    description: localize('birthdays', 'set-command-month-description')
                },
                {
                    type: 'INTEGER',
                    required: false,
                    name: 'year',
                    description: localize('birthdays', 'set-command-year-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'delete',
            description: localize('birthdays', 'delete-command-description')
        }
        ];
        if (!client.configurations['birthday']['config'].disableSync) commands.push({
            type: 'SUB_COMMAND',
            name: 'sync',
            description: localize('birthdays', 'sync-command-description'),
            options: [
                {
                    type: 'STRING',
                    name: 'action',
                    description: localize('birthdays', 'sync-command-action-description'),
                    required: true,
                    choices: [
                        {
                            name: 'enable',
                            description: localize('birthdays', 'sync-command-action-enable-description'),
                            value: 'enable'
                        },
                        {
                            name: 'disable',
                            description: localize('birthdays', 'sync-command-action-disable-description'),
                            value: 'disable'
                        }
                    ]
                }
            ]
        });
        return commands;
    }
};