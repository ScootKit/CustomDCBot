const {generateBirthdayEmbed} = require('../birthday');
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
            content: '⚠️️ ' + localize('birthdays', 'no-birthday-set')
        });
        interaction.reply({
            ephemeral: true,
            content: localize('birthdays', 'birthday-status', {
                dd: interaction.birthday.day,
                mm: interaction.birthday.month,
                yyyy: (interaction.birthday.year ? `.${interaction.birthday.year}` : ''),
                age: interaction.birthday.year ? ', ' + (localize('birthdays', 'your-age', {age: new AgeFromDateString(`${interaction.birthday.year}-${interaction.birthday.month - 1}-${interaction.birthday.day}`).age})) : ''
            })
        });

    },
    'delete': async function (interaction) {
        if (!interaction.birthday) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('birthdays', 'no-birthday-set')
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

        if ((day > 31 || day < 1) || (month > 12 || month < 1)) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('birthdays', 'invalid-date')
        });

        if (year) {
            const age = new AgeFromDate(new Date(year, month - 1, day)).age;
            if (age < 13) return interaction.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('birthdays', 'against-tos', {waitTime: 13 - age})
            });
            if (age > 125) return interaction.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('birthdays', 'too-old')
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

    options: [{
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
    ]
};