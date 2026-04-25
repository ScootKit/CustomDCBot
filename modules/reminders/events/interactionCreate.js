const {localize} = require('../../../src/functions/localize');
const {formatDate} = require('../../../src/functions/helpers');
const {planReminder} = require('../reminders');

const snoozeDurations = {
    '10m': 10 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};

/**
 * Handle snooze button interactions for reminders
 * @param {Client} client Discord client
 * @param {Interaction} interaction Button interaction
 */
module.exports.run = async function (client, interaction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('reminder-snooze-')) return;

    const parts = interaction.customId.split('-');
    const durationKey = parts[2];
    const reminderID = parts[3];
    const duration = snoozeDurations[durationKey];
    if (!duration) return;

    const originalReminder = await client.models['reminders']['Reminder'].findOne({where: {id: reminderID}});
    if (!originalReminder || originalReminder.userID !== interaction.user.id) {
        return interaction.reply({ephemeral: true, content: '⚠️ ' + localize('reminders', 'snooze-not-allowed')});
    }

    const newDate = new Date(new Date().getTime() + duration);
    const newReminder = await client.models['reminders']['Reminder'].create({
        userID: interaction.user.id,
        reminderText: originalReminder.reminderText,
        date: newDate,
        channelID: originalReminder.channelID
    });
    planReminder(client, newReminder);

    await interaction.update({components: []});
    await interaction.followUp({
        ephemeral: true,
        content: '✅ ' + localize('reminders', 'snoozed', {d: formatDate(newDate)})
    });
};
