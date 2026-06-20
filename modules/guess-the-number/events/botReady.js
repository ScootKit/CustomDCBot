const {startGame} = require('../guessTheNumber');
const {randomIntFromInterval} = require('../../../src/functions/helpers');
module.exports.run = async function (client) {
    if (client.configurations['guess-the-number']['channel'].enabled && client.configurations['guess-the-number']['channel']) {
        const channel = await client.guild.channels.fetch(client.configurations['guess-the-number']['channel'].channel).catch(() => {
        });
        if (!channel) return;
        const game = await client.models['guess-the-number']['Channel'].findOne({
            where: {
                channelID: channel.id,
                ended: false
            }
        });
        if (game) return;
        await startGame(channel, randomIntFromInterval(client.configurations['guess-the-number']['channel'].minInt, client.configurations['guess-the-number']['channel'].maxInt), client.configurations['guess-the-number']['channel'].minInt, client.configurations['guess-the-number']['channel'].maxInt);
    }
};