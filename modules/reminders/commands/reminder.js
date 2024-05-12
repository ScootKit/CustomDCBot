const {localize} = require('../../../src/functions/localize');
const durationParser = require('parse-duration');
const {planReminder} = require('../reminders');
const {formatDate} = require('../../../src/functions/helpers');

module.exports.run = async function (interaction) {
    const duration = durationParser(interaction.options.getString('in'));
    const time = new Date(duration + new Date().getTime());
    if (!time || isNaN(time) || time.getTime() < new Date().getTime() + 55000) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('reminders', 'one-minute-in-future')
    });
    const reminderObject = await interaction.client.models['reminders']['Reminder'].create({
        userID: interaction.user.id,
        reminderText: interaction.options.getString('what'),
        date: time,
        channelID: interaction.options.getBoolean('dm') ? 'DM' : interaction.channel.id
    });
    planReminder(interaction.client, reminderObject);
    interaction.reply({
        ephemeral: true,
        content: '✅ ' + localize('reminders', 'reminder-set', {d: formatDate(time)})
    });
};

module.exports.config = {
    name: 'remind-me',
    description: localize('reminders', 'command-description'),

    options: [
        {
            type: 'STRING',
            name: 'in',
            required: true,
            description: localize('reminders', 'in-description')
        },
        {
            type: 'STRING',
            name: 'what',
            required: true,
            description: localize('reminders', 'what-description')
        },
        {
            type: 'BOOLEAN',
            name: 'dm',
            description: localize('reminders', 'dm-description')
        }
    ]
};