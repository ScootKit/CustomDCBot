const {localize} = require('../../src/functions/localize');
const {
    embedType,
    unlockChannel
} = require('../../src/functions/helpers');

module.exports.startGame = async function (channel, number, min, max, ownerID = null) {
    await channel.client.models['guess-the-number']['Channel'].create({
        channelID: channel.id,
        number,
        min,
        max,
        ownerID,
        ended: false
    });
    const pins = await channel.messages.fetchPinned();
    for (const pin of pins.values()) {
        if (pin.author.id !== channel.client.user.id) continue;
        await pin.unpin();
    }
    const buttonComponents = [
        {
            type: 'BUTTON',
            label: localize('guess-the-number', 'emoji-guide-button'),
            style: 'SECONDARY',
            customId: 'gtn-reaction-meaning'
        }
    ];
    if (channel.client.configurations['guess-the-number']['config'].enableLeaderboard) {
        buttonComponents.push({
            type: 'BUTTON',
            label: localize('guess-the-number', 'leaderboard-button'),
            style: 'PRIMARY',
            customId: 'gtn-leaderboard',
            emoji: '🏆'
        });
    }
    const m = await channel.send(embedType(channel.client.configurations['guess-the-number']['config'].startMessage, {
        '%min%': min,
        '%max%': max
    }, {
        components: [{
            type: 'ACTION_ROW',
            components: buttonComponents
        }]
    }));
    await m.pin();

    const channelLock = await channel.client.models['ChannelLock'].findOne({where: {id: channel.id}});
    if (channelLock) await unlockChannel(channel, '[guess-the-number] ' + localize('guess-the-number', 'game-started'));
};