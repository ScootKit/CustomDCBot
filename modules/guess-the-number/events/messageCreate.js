const {
    embedType,
    lockChannel,
    randomIntFromInterval
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {startGame} = require('../guessTheNumber');

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.author.bot) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    const game = await client.models['guess-the-number']['Channel'].findOne({
        where: {
            channelID: msg.channel.id,
            ended: false
        }
    });
    if (!game) return;
    if (msg.member.roles.cache.filter(m => m.client.configurations['guess-the-number']['config'].adminRoles.includes(m.id)).size !== 0 && !(client.configurations['guess-the-number']['channel'].enabled && client.configurations['guess-the-number']['channel'].channel === msg.channel.id)) return msg.react('⛔');
    const parsedInt = parseInt(msg.content);
    if (isNaN(parsedInt)) return msg.react('🚫');
    if (parsedInt < game.min || parsedInt > game.max) return msg.react('🚫');
    game.guessCount++;
    await game.save();
    if (parsedInt !== game.number) {
        if (client.configurations['guess-the-number']['config']['higherLowerReactions']) {
            if (game.number < parsedInt) await msg.react('⬇'); else await msg.react('⬆');
            return;
        }
        return msg.react('❌');
    }
    await msg.react('✅');
    game.ended = true;
    await game.save();
    const isGamechannel = client.configurations['guess-the-number']['channel'].enabled && client.configurations['guess-the-number']['channel'].channel === msg.channel.id;
    if (!isGamechannel) await lockChannel(msg.channel, client.configurations['guess-the-number']['config'].adminRoles, '[guess-the-number] ' + localize('guess-the-number', 'game-ended'));
    await msg.reply(embedType(client.configurations['guess-the-number']['config']['endMessage'], {
        '%min%': game.min,
        '%max%': game.max,
        '%winner%': msg.author.toString(),
        '%guessCount%': game.guessCount,
        '%number%': game.number
    }));
    if (isGamechannel) await startGame(msg.channel, randomIntFromInterval(client.configurations['guess-the-number']['channel'].minInt, client.configurations['guess-the-number']['channel'].maxInt), client.configurations['guess-the-number']['channel'].minInt, client.configurations['guess-the-number']['channel'].maxInt);
};