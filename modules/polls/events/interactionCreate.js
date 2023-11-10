const {updateMessage} = require('../polls');
const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');
const {truncate} = require('../../../src/functions/helpers');
module.exports.run = async (client, interaction) => {
    if (!interaction.message && !(interaction.customId || '').startsWith('polls-rem-vot-')) return;
    const poll = await client.models['polls']['Poll'].findOne({
        where: {
            messageID: (interaction.customId || '').startsWith('polls-rem-vot-') ? interaction.customId.replaceAll('polls-rem-vot-', '') : (interaction.message || {}).id
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
            content: '⚠️ ' + localize('polls', 'not-voted-yet'),
            ephemeral: true
        });
        return interaction.reply({
            content: localize('polls', 'you-voted', {o: poll.options[userVoteCat - 1]}) + (!expired ? '\n' + localize('polls', 'change-opinion') : ''),
            ephemeral: true,
            components: [
                {
                    type: 'ACTION_ROW',
                    components: expired ? [] : [
                        {
                            type: 'BUTTON',
                            style: 'DANGER',
                            customId: 'polls-rem-vot-' + poll.messageID,
                            label: '🗑 ' + localize('polls', 'remove-vote')
                        }
                    ]
                }
            ]
        });
    }

    if (interaction.isButton() && interaction.customId === 'polls-public-votes') {
        if (!poll.description.startsWith('[PUBLIC]')) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('polls', 'not-public')
        });
        const embed = new MessageEmbed()
            .setTitle(localize('polls', 'view-public-votes'))
            .setColor(0xE67E22);
        for (const vId in poll.options) {
            const voters = [];
            for (const voterID of poll.votes[parseInt(vId) + 1] || []) {
                voters.push('<@' + voterID + '>');
            }
            embed.addField(interaction.client.configurations['polls']['config']['reactions'][parseInt(vId) + 1] + ' ' + poll.options[vId], truncate(voters.join(',') || '*' + localize('polls', 'no-votes-for-this-option') + '*', 1024));
        }
        return interaction.reply({
            ephemeral: true,
            embeds: [embed]
        });
    }


    if (poll.expiresAt && new Date(poll.expiresAt).getTime() <= new Date().getTime()) return;
    if (interaction.isButton() && (interaction.customId || '').startsWith('polls-rem-vot-')) {
        const o = poll.votes;
        poll.votes = {};
        for (const id in o) {
            if (o[(parseInt(id)).toString()] && o[(parseInt(id)).toString()].includes(interaction.user.id)) o[(parseInt(id)).toString()].splice(o[(parseInt(id)).toString()].indexOf(interaction.user.id), 1);
        }
        poll.votes = o;
        await poll.save();
        await updateMessage(interaction.channel, poll, interaction.customId.replaceAll('polls-rem-vot-', ''));
        return await interaction.reply({
            content: '✅ ' + localize('polls', 'removed-vote'),
            ephemeral: true
        });
    }
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