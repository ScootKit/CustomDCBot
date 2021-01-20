const {scheduleJob} = require('node-schedule');
const {embedType} = require('../../src/functions/helpers');
const {confDir} = require('../../main');

module.exports.createGiveaway = async function (organiser, channel, prize, endAt, winners) {
    const moduleStrings = require(`${confDir}/giveaways/strings.json`);
    endAt = new Date(endAt);
    channel.send(...await embedType(moduleStrings['giveaway_message'], {
        '%prize%': prize,
        '%winners%': winners,
        '%endAt%': `${endAt.getHours()}:${endAt.getMinutes()} ${endAt.getDate()}.${endAt.getMonth() + 1}.${endAt.getFullYear()}`,
        '%organiser%': `<@${organiser.id}>`
    })).then(async m => {
        const dbItem = await channel.client.models['giveaways']['Giveaway'].create({
            endAt: endAt.getTime(),
            winnerCount: winners,
            prize: prize,
            organiser: organiser.id,
            messageID: m.id,
            channelID: channel.id
        });
        scheduleJob(endAt, async () => {
            await endGiveaway(dbItem.id);
        });
        await m.react('🎉');
    });

};

async function endGiveaway(gID) {
    const {client} = require('../../main');
    const moduleStrings = require(`${confDir}/giveaways/strings.json`);

    const giveaway = await client.models['giveaways']['Giveaway'].findOne({
        where: {
            id: gID
        }
    });
    if (!giveaway) return;

    const channel = await client.channels.fetch(giveaway.channelID, true, true);
    if (!channel) return;
    let message = await channel.messages.fetch(giveaway.messageID, true, true);
    if (!message) return;

    const winners = [];
    message = await message.fetch(true);
    await message.react('🎉');
    let participants = await (message.reactions.cache.first().users.fetch());
    participants = participants.filter(u => !u.bot);
    if (participants.size < giveaway.winnerCount) giveaway.winnerCount = participants.size;

    for (let winnerCount = 0; winnerCount < giveaway.winnerCount; winnerCount++) {
        const winner = participants.random();
        if (!winners.includes(winner)) winners.push(winner);
        else winnerCount--;
    }

    let winnersstring = '';
    winners.forEach(winner => {
        winnersstring = winnersstring + `<@${winner.id}> `;
    });

    const endAt = new Date(parseInt(giveaway.endAt));
    await channel.send(...await embedType(moduleStrings['winner_message'], {
        '%prize%': giveaway.prize,
        '%winners%': winners,
        '%url%': `<${message.url}>`,
        '%organiser%': `<@${giveaway.organiser}>`
    }));
    await message.edit(
        ...await embedType(moduleStrings['giveaway_message_edit_after_winning'], {
            '%prize%': giveaway.prize,
            '%endAt%': `${endAt.getHours()}:${endAt.getMinutes()} ${endAt.getDate()}.${endAt.getMonth() + 1}.${endAt.getFullYear()}`,
            '%winners%': winners,
            '%organiser%': `<@${giveaway.organiser}>`
        })
    );
    giveaway.ended = true;
    giveaway.save();
}

module.exports.endGiveaway = endGiveaway;