const {countingGameParseContent} = require('./messageCreate');
const {embedType} = require('../../../src/functions/helpers');
module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (msg.author.bot) return;

    const moduleConfig = client.configurations['counter']['config'];
    if (!moduleConfig.channels.includes(msg.channel.id) || !moduleConfig.protectAgainstDeletion) return;
    const object = await client.models['counter']['CountChannel'].findOne({
        where: {
            channelID: msg.channel.id
        }
    });
    if (!object) return;

    if (await countingGameParseContent(msg.content, client) === object.currentNumber && msg.author.id === object.lastCountedUser) {
        msg.channel.send(embedType(moduleConfig.protectionMessage, {
            '%mention%': msg.author.toString(),
            '%number%': object.currentNumber
        }));
    }
};