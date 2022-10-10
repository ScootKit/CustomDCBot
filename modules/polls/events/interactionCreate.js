const {updateMessage} = require('../polls');
const {localize} = require('../../../src/functions/localize');
module.exports.run = async (client, interaction) => {
    if (!interaction.message) return;
    const poll = await client.models['polls']['Poll'].findOne({
        where: {
            messageID: interaction.message.id
        }
    });
    if (!poll) return;
    let expired = false;
    if (poll.expiresAt || poll.endAt) {
        const date = new Date(poll.expiresAt || poll.endAt);
        if (date.getTime() <= new Date().getTime()) expired = true;
    }

    if (interaction.isButton() && interaction.customId === 'polls-own-vote') {
        let userVoteCat = null;
        for (const id in poll.votes) {
            if (poll.votes[id].includes(interaction.user.id)) userVoteCat = id;
        }
        if (!userVoteCat) return interaction.reply({
            content: '⚠ ' + localize('polls', 'not-voted-yet'),
            ephemeral: true
        });
        return interaction.reply({
            content: localize('polls', 'you-voted', {o: poll.options[userVoteCat - 1]}) + (!expired ? '\n' + localize('polls', 'change-opinion') : ''),
            ephemeral: true
        });
    }
    if (poll.expiresAt && new Date(poll.expiresAt).getTime() <= new Date().getTime()) return;
    if (interaction.isSelectMenu() && interaction.customId === 'polls-vote') {
        const o = poll.votes;
        poll.votes = {};
        for (const id in o) {
            if (o[(parseInt(id)).toString()] && o[(parseInt(id)).toString()].includes(interaction.user.id)) o[(parseInt(id)).toString()].splice(o[(parseInt(id)).toString()].indexOf(interaction.user.id), 1);
        }
        o[(parseInt(interaction.values[0]) + 1).toString()].push(interaction.user.id);
        poll.votes = o;
        await poll.save();
        await updateMessage(interaction.message.channel, poll, interaction.message.id);
        await interaction.reply({
            content: localize('polls', 'voted-successfully'),
            ephemeral: true
        });
    }
};